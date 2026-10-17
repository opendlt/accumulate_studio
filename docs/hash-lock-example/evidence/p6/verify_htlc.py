#!/usr/bin/env python3
"""Independent on-chain verifier for ONE hash-lock run (stdlib only; it trusts nothing the program printed).

Given the send txid it queries Kermit's v3 API itself and requires (positive mode):
  1. the send is delivered and carries a hashLock in its header;
  2. the locked deposit is found among the send's `produced` records (never trusting `produced.total`),
     is a delivered syntheticLockedDeposit, and its result.releaseTxID is set - and, when --release is
     given (what the program printed), equals it;
  3. that release is delivered, is a releaseLockedOperation targeting THAT deposit, and its preimage
     hashes (sha256 / sha256d / hash160, over the raw bytes) to the lock's hash;
  4. the receiver balance is exactly <before> + <amount> (receiver defaults to the send's recipient);
     optionally the sender is down by exactly the funded amount minus the lock (--sender-funded).
With --negative (a wrong-preimage run) it requires the opposite outcome: the lock exists and its deposit is
delivered but NEVER released (no releaseTxID), the receiver is unchanged, and the attempted release, when
--release is given, is not delivered and carries the node's "preimage does not match hash".
The raw query JSON of every record is saved next to the verdict. Exit 1 on any failed check.

usage: verify_htlc.py --send TXID [--release TXID] [--receiver URL] [--amount 100000000] [--before 0]
                      [--sender URL] [--sender-funded 500000000] [--sender-expected N] [--negative] --out FILE.json
"""
import argparse
import hashlib
import json
import sys
import urllib.request

EP = "https://kermit.accumulatenetwork.io/v3"


def query(scope):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": {"scope": scope}}).encode()
    req = urllib.request.Request(EP, data=body, headers={"content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=30))
    return r.get("result"), r.get("error")


def txid_key(txid):
    """Compare txids by hash and account, ignoring the acc:// scheme and case."""
    t = txid.lower()
    return t[len("acc://"):] if t.startswith("acc://") else t


# RIPEMD-160 (used by the HASH160 lock). hashlib only has it when the OpenSSL build ships it and
# OpenSSL 3 may not, so fall back to a pure implementation instead of failing.
_RMD_R1 = (
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
)
_RMD_R2 = (
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
)
_RMD_S1 = (
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
)
_RMD_S2 = (
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
)
_RMD_K1 = (0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E)
_RMD_K2 = (0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000)


def _ripemd160_pure(data):
    def rol(x, n):
        return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF

    def f(rnd, x, y, z):
        if rnd == 0:
            return x ^ y ^ z
        if rnd == 1:
            return (x & y) | (~x & 0xFFFFFFFF & z)
        if rnd == 2:
            return (x | (~y & 0xFFFFFFFF)) ^ z
        if rnd == 3:
            return (x & z) | (y & (~z & 0xFFFFFFFF))
        return x ^ (y | (~z & 0xFFFFFFFF))

    msg = bytearray(data)
    bit_len = len(msg) * 8
    msg.append(0x80)
    while len(msg) % 64 != 56:
        msg.append(0)
    msg += bit_len.to_bytes(8, "little")
    h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
    for off in range(0, len(msg), 64):
        x = [int.from_bytes(msg[off + 4 * i:off + 4 * i + 4], "little") for i in range(16)]
        a1, b1, c1, d1, e1 = h
        a2, b2, c2, d2, e2 = h
        for j in range(80):
            rnd = j // 16
            t = (rol((a1 + f(rnd, b1, c1, d1) + x[_RMD_R1[j]] + _RMD_K1[rnd]) & 0xFFFFFFFF, _RMD_S1[j]) + e1) & 0xFFFFFFFF
            a1, e1, d1, c1, b1 = e1, d1, rol(c1, 10), b1, t
            t = (rol((a2 + f(4 - rnd, b2, c2, d2) + x[_RMD_R2[j]] + _RMD_K2[rnd]) & 0xFFFFFFFF, _RMD_S2[j]) + e2) & 0xFFFFFFFF
            a2, e2, d2, c2, b2 = e2, d2, rol(c2, 10), b2, t
        t = (h[1] + c1 + d2) & 0xFFFFFFFF
        h[1] = (h[2] + d1 + e2) & 0xFFFFFFFF
        h[2] = (h[3] + e1 + a2) & 0xFFFFFFFF
        h[3] = (h[4] + a1 + b2) & 0xFFFFFFFF
        h[4] = (h[0] + b1 + c2) & 0xFFFFFFFF
        h[0] = t
    return b"".join(v.to_bytes(4, "little") for v in h)


def ripemd160(data):
    try:
        return hashlib.new("ripemd160", data).digest()
    except ValueError:
        return _ripemd160_pure(data)


def digest(alg, preimage):
    alg = (alg or "").lower()  # the node reports the enum as "sha256" / "sha256D" / "hash160"
    d = hashlib.sha256(preimage).digest()
    if alg == "sha256d":
        d = hashlib.sha256(d).digest()
    elif alg == "hash160":
        d = ripemd160(d)  # RIPEMD160(SHA256(x)), 20 bytes
    elif alg != "sha256":
        raise ValueError(f"unsupported algorithm {alg!r}")
    return d.hex()


def balance_of(url):
    res, err = query(url)
    if res is None:
        return None, err, res
    acct = res.get("account") or {}
    bal = acct.get("balance")
    if bal is None and acct.get("type") in ("tokenAccount", "liteTokenAccount"):
        bal = 0  # the node omits a zero balance from the account record
    return (int(bal) if bal is not None else None), err, res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--send", required=True)
    ap.add_argument("--release")
    ap.add_argument("--receiver")
    ap.add_argument("--amount", type=int, default=100000000)
    ap.add_argument("--before", type=int, default=0)
    ap.add_argument("--sender")
    ap.add_argument("--sender-funded", type=int)
    ap.add_argument("--sender-expected", type=int)
    ap.add_argument("--negative", action="store_true")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    raw, checks = {}, []

    def check(name, ok, detail=""):
        checks.append({"check": name, "ok": bool(ok), "detail": str(detail)})
        print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
        return bool(ok)

    # 1. the send
    send, err = query(a.send)
    raw["send"] = send or {"error": err}
    if not check("send record found", send, err or ""):
        return finish(a, raw, checks)
    s_msg = (send.get("message") or {}).get("transaction") or {}
    s_body = s_msg.get("body") or {}
    lock = (s_msg.get("header") or {}).get("hashLock") or {}
    check("send delivered, no error", send.get("status") == "delivered" and not send.get("error"),
          f"status={send.get('status')} error={(send.get('error') or {}).get('message')}")
    check("send body is sendTokens", s_body.get("type") == "sendTokens")
    check("send header carries the hashLock", lock.get("hash") and lock.get("hashAlgorithm"),
          json.dumps(lock)[:160])
    to = (s_body.get("to") or [{}])[0]
    check("send amount is exactly the lock amount", str(to.get("amount")) == str(a.amount), to.get("amount"))
    receiver = a.receiver or to.get("url")
    sender = a.sender or (s_msg.get("header") or {}).get("principal")

    # 2. the deposit, found among produced records
    records = (send.get("produced") or {}).get("records") or []
    deposit_id, deposit = None, None
    for rec in records:
        cand = rec.get("value") if isinstance(rec, dict) else rec
        res, derr = query(cand)
        raw.setdefault("produced", {})[cand] = res or {"error": derr}
        body = (((res or {}).get("message") or {}).get("transaction") or {}).get("body") or {}
        if body.get("type") == "syntheticLockedDeposit":
            deposit_id, deposit = cand, res
            break
    if not check("a syntheticLockedDeposit is among send.produced.records", deposit, f"{len(records)} record(s)"):
        return finish(a, raw, checks)
    check("deposit delivered", deposit.get("status") == "delivered", deposit.get("status"))
    rel_in_deposit = (deposit.get("result") or {}).get("releaseTxID")

    if a.negative:
        check("deposit was NEVER released (no result.releaseTxID): the lock stayed locked", not rel_in_deposit,
              f"releaseTxID={rel_in_deposit}")
        if a.release:
            rel, rerr = query(a.release)
            raw["attempted_release"] = rel or {"error": rerr}
            node_err = ((rel or {}).get("error") or {}).get("message") if rel else str(rerr)
            check("the wrong-preimage release was NOT delivered", rel is None or (rel.get("status") != "delivered"),
                  f"status={(rel or {}).get('status')}")
            check("the node's error says the preimage does not match", node_err and "preimage does not match hash" in node_err,
                  node_err)
        bal, berr, braw = balance_of(receiver)
        raw["receiver"] = braw or {"error": berr}
        check(f"receiver balance unchanged at {a.before}", bal == a.before, f"balance={bal}")
        return finish(a, raw, checks)

    release_id = rel_in_deposit or a.release
    check("deposit result.releaseTxID is set", rel_in_deposit, rel_in_deposit)
    if a.release:
        check("deposit result.releaseTxID equals the release txid the program printed",
              rel_in_deposit and txid_key(rel_in_deposit) == txid_key(a.release), f"program printed {a.release}")
    if not release_id:
        return finish(a, raw, checks)

    # 3. the release
    rel, err = query(release_id)
    raw["release"] = rel or {"error": err}
    if not check("release record found", rel, err or ""):
        return finish(a, raw, checks)
    r_body = ((rel.get("message") or {}).get("transaction") or {}).get("body") or {}
    check("release delivered, no error", rel.get("status") == "delivered" and not rel.get("error"),
          f"status={rel.get('status')} error={(rel.get('error') or {}).get('message')}")
    check("release is a releaseLockedOperation", r_body.get("type") == "releaseLockedOperation", r_body.get("type"))
    check("release targets THIS deposit (not the send)",
          r_body.get("lockedTxID") and txid_key(r_body["lockedTxID"]) == txid_key(deposit_id), r_body.get("lockedTxID"))
    try:
        got = digest(lock.get("hashAlgorithm", ""), bytes.fromhex(r_body.get("preimage", "")))
        check("release preimage hashes to the lock's hash", got == lock.get("hash"),
              f"{lock.get('hashAlgorithm')}({len(r_body.get('preimage', '')) // 2} bytes) = {got[:16]}...")
    except ValueError as e:
        check("release preimage hashes to the lock's hash", False, e)

    # 4. balances
    bal, berr, braw = balance_of(receiver)
    raw["receiver"] = braw or {"error": berr}
    check(f"receiver balance is exactly {a.before} + {a.amount}", bal == a.before + a.amount, f"balance={bal}")
    expected_sender = a.sender_expected if a.sender_expected is not None else (
        a.sender_funded - a.amount if a.sender_funded is not None else None)
    if sender and expected_sender is not None:
        sbal, serr, sraw = balance_of(sender)
        raw["sender"] = sraw or {"error": serr}
        check(f"sender balance is exactly {expected_sender}", sbal == expected_sender, f"balance={sbal}")

    return finish(a, raw, checks)


def finish(a, raw, checks):
    ok = all(c["ok"] for c in checks)
    verdict = {"endpoint": EP, "mode": "negative" if a.negative else "positive", "send": a.send,
               "release": a.release, "amount": a.amount, "RESULT": "PASS" if ok else "FAIL",
               "checks": checks, "raw": raw}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(verdict, f, indent=2)
    print(f"VERIFY {'PASS' if ok else 'FAIL'}: {sum(c['ok'] for c in checks)}/{len(checks)} checks -> {a.out}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
