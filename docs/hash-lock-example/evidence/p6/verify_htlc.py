#!/usr/bin/env python3
"""Independent on-chain verifier for ONE hash-lock run (stdlib only; it trusts nothing the program printed).

Given the send txid it queries Kermit's v3 API itself and requires (positive mode):
  1. the send is delivered and carries a hashLock in its header;
  2. the locked deposit is found among the send's `produced` records (never trusting `produced.total`),
     is a delivered syntheticLockedDeposit, and its result.releaseTxID is set - and, when --release is
     given (what the program printed), equals it;
  3. that release is delivered, is a releaseLockedOperation targeting THAT deposit, and its preimage
     hashes (sha256 / sha256d, over the raw bytes) to the lock's hash;
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


def digest(alg, preimage):
    alg = (alg or "").lower()  # the node reports the enum as "sha256" / "sha256D"
    d = hashlib.sha256(preimage).digest()
    if alg == "sha256d":
        d = hashlib.sha256(d).digest()
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
