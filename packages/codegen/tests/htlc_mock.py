"""
Stateful mock of the node's hash-lock (HTLC) behaviour for the validation harnesses.

The harnesses (validate_*.py) answer generic JSON-RPC calls with canned responses. That is
enough for flows whose success is "no exception", but a hash-lock flow only means something if
the generated program does what the node requires, so this module plays the node's side:

  * a SendTokens whose header carries `hashLock` is a LOCKED send. The mock checks the lock the
    way the node does (hash length for the algorithm, expiration 10 minutes to 30 days ahead),
    records a locked deposit as one of the send's `produced` records, and never credits anyone;
  * the deposit is queryable as `syntheticLockedDeposit` / `delivered` (the first query of each
    deposit answers NotFound, like a produced transaction that is still in flight);
  * a `releaseLockedOperation` is accepted at submit and judged at execute: the preimage must
    hash to the lock, the principal must be the deposit's recipient, and a deposit can be
    released once. A rejected release reads back as a failed transaction (status 401 with the
    node's error message), exactly as on Kermit;
  * `produced.total` deliberately exceeds `produced.records` (observed on Kermit), so a program
    that trusts `total` instead of scanning the records fails here.

Everything else returns None so the harness falls through to its legacy responses. The report
gets an `htlc` summary only when HTLC traffic was seen, so flows without a lock are unchanged.

FAITHFUL mode (environment HTLC_MOCK_FAITHFUL=1, set by the validation suites for the hash-lock
template only) answers EVERY transaction the way Kermit does, because a hash-lock flow is only as
good as the steps around the lock: full TxID URLs (`acc://<hash>@<principal>`), string statuses
("delivered"), and the real two-entry submit response (the transaction, then the SIGNATURE message,
which is the id the Dart and Rust SDKs hand back as `txid`). The legacy responses (bare hex txids,
object statuses) stay untouched for every other template, so their baselines do not move.
"""

import hashlib
import os
import re
import threading
from datetime import datetime, timedelta, timezone

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

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


def _hash160(b):
    """HASH160 as the node defines it: RIPEMD160(SHA256(x)), 20 bytes."""
    return ripemd160(hashlib.sha256(b).digest())


# Lock algorithm -> (digest function over the preimage bytes, hash length in bytes)
_ALGOS = {
    "sha256": (lambda b: hashlib.sha256(b).digest(), 32),
    "sha256d": (lambda b: hashlib.sha256(hashlib.sha256(b).digest()).digest(), 32),
    "hash160": (_hash160, 20),
    1: (lambda b: hashlib.sha256(b).digest(), 32),
    2: (lambda b: hashlib.sha256(hashlib.sha256(b).digest()).digest(), 32),
    3: (_hash160, 20),
}


def _walk(obj):
    """Yield every dict nested anywhere inside obj."""
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v)


def _transactions(params):
    """Every transaction-shaped dict (a header and a typed body) inside a submit payload."""
    out = []
    for d in _walk(params):
        body = d.get("body")
        header = d.get("header")
        if isinstance(body, dict) and isinstance(header, dict) and body.get("type"):
            out.append(d)
    return out


def _hash_of(scope):
    m = HEX64.search(scope or "")
    return m.group(0).lower() if m else None


def _norm_url(url):
    u = str(url or "").lower().strip()
    if u.startswith("acc://"):
        u = u[len("acc://"):]
    return u.rstrip("/")


def _parse_time(value):
    """RFC 3339 string or Unix seconds -> aware datetime; None when unparseable."""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        s = str(value).strip()
        if s.isdigit():
            return datetime.fromtimestamp(int(s), tz=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, OSError, OverflowError):
        return None


class HtlcMock:
    def __init__(self):
        self._lock = threading.Lock()
        self.faithful = os.environ.get("HTLC_MOCK_FAITHFUL") == "1"
        self.reset()

    def reset(self):
        self.plain = {}      # hash -> record for every other transaction (faithful mode)
        self.sigs = {}       # signature message hash -> transaction hash
        self.sends = {}      # send hash -> record
        self.deposits = {}   # deposit hash -> record
        self.releases = {}   # release hash -> record
        self.violations = []
        self._seq = 0

    # ------------------------------------------------------------------ helpers
    def _new_hash(self, kind):
        self._seq += 1
        return hashlib.sha256(f"htlc-mock-{kind}-{self._seq}".encode()).hexdigest()

    def active(self):
        return bool(self.sends or self.releases)

    @staticmethod
    def _signer_of(tx_or_params, fallback):
        """The signer URL recorded in the envelope's signatures, else the fallback principal."""
        for d in _walk(tx_or_params):
            signer = d.get("signer")
            if isinstance(signer, str) and signer:
                return signer
            if isinstance(signer, dict) and signer.get("url"):
                return signer["url"]
        return fallback

    # ------------------------------------------------------------------ routing
    def route(self, method, params):
        """Return a JSON-RPC response body (dict with `result` or `error`) or None to fall through."""
        with self._lock:
            if method in ("submit", "execute-direct", "execute"):
                return self._submit(method, params)
            if method == "query":
                scope = params.get("scope", "") if isinstance(params, dict) else ""
                return self._query(scope, v2=False)
            if method == "query-tx":
                txid = (params or {}).get("txid", "") if isinstance(params, dict) else ""
                return self._query(txid, v2=True)
        return None

    # ------------------------------------------------------------------ submit
    def _submit(self, method, params):
        txs = _transactions(params)
        handled = []
        for tx in txs:
            body, header = tx["body"], tx["header"]
            btype = str(body.get("type", ""))
            if btype == "sendTokens" and header.get("hashLock"):
                handled.append(self._locked_send(header, body))
            elif btype.lower() == "releaselockedoperation":
                handled.append(self._release(header, body))
            elif self.faithful:
                handled.append(self._plain(header, body))
        if not handled:
            return None
        txid = handled[0]
        if method == "submit" and self.faithful:
            principal = self._principal_of(txid)
            sig = self._new_hash("signature")
            self.sigs[sig] = txid
            signer = _norm_url(self._signer_of(params, principal))
            return {"result": [
                {"status": {"txID": f"acc://{txid}@{principal}", "code": 201}, "success": True},
                {"status": {"txID": f"acc://{sig}@{signer}", "code": 201}, "success": True},
            ]}
        if method == "submit":
            return {"result": [{"status": {"txID": txid}, "success": True}]}
        return {"result": {"txid": txid, "hash": txid, "simpleHash": txid, "envelopeHash": txid, "type": "envelope", "result": {}}}

    def _principal_of(self, h):
        for table in (self.sends, self.releases, self.plain):
            rec = table.get(h)
            if rec:
                return _norm_url(rec.get("principal")) or "unknown"
        return "unknown"

    def _plain(self, header, body):
        h = self._new_hash("tx")
        self.plain[h] = {"principal": header.get("principal"), "type": str(body.get("type", "unknown"))}
        return h

    def _locked_send(self, header, body):
        lock = header["hashLock"]
        algo = lock.get("hashAlgorithm")
        algo_key = str(algo).lower() if isinstance(algo, str) else algo
        digest_len = _ALGOS[algo_key][1] if algo_key in _ALGOS else None
        hash_hex = str(lock.get("hash", "")).lower()
        if digest_len is None:
            self.violations.append(f"unsupported hashlock algorithm: {algo!r}")
        elif not re.fullmatch(r"[0-9a-f]+", hash_hex) or len(hash_hex) != digest_len * 2:
            self.violations.append(f"hashlock hash must be {digest_len} bytes of hex, got {len(hash_hex) // 2}")
        expiration = _parse_time(lock.get("expiration"))
        now = datetime.now(timezone.utc)
        if expiration is None:
            self.violations.append("hashlock expiration is required")
        else:
            if expiration < now + timedelta(minutes=10):
                self.violations.append("hashlock expiration must be at least 10 minutes in the future")
            if expiration > now + timedelta(days=30):
                self.violations.append("hashlock expiration cannot exceed 30 days")
            # The binary form carries Unix seconds, so only a NON-ZERO fraction can change the
            # transaction hash; ".000Z" is the same instant as "Z" and is accepted.
            frac = re.search(r"T\d{2}:\d{2}:\d{2}\.(\d+)", str(lock.get("expiration")))
            if frac and frac.group(1).strip("0"):
                self.violations.append("hashlock expiration must be whole seconds")
        recipients = body.get("to") or []
        recipient = recipients[0].get("url") if recipients and isinstance(recipients[0], dict) else None
        send = self._new_hash("send")
        dep = self._new_hash("deposit")
        self.sends[send] = {
            "principal": header.get("principal"), "recipient": recipient, "lock": lock,
            "algo": algo_key, "hash": hash_hex, "deposit": dep, "queries": 0,
        }
        self.deposits[dep] = {
            "send": send, "recipient": recipient, "algo": algo_key, "hash": hash_hex,
            "release": None, "queries": 0, "amount": recipients[0].get("amount") if recipients else None,
        }
        return send

    def _release(self, header, body):
        locked = body.get("lockedTxID", body.get("lockedTxId", ""))
        dep_hash = _hash_of(str(locked))
        preimage_hex = str(body.get("preimage", "")).lower()
        release = self._new_hash("release")
        rec = {"deposit": dep_hash, "ok": False, "error": None, "preimage": preimage_hex, "queries": 0,
               "principal": header.get("principal")}
        dep = self.deposits.get(dep_hash) if dep_hash else None
        if not re.fullmatch(r"([0-9a-f]{2}){1,256}", preimage_hex):
            rec["error"] = ("preimage is required" if not preimage_hex else "preimage too large (max 256 bytes)")
            self.violations.append(f"release preimage is not 1 to 256 bytes of hex: {preimage_hex[:16]!r}")
        elif dep is None:
            rec["error"] = "locked transaction not found"
            self.violations.append(f"release targets {str(locked)[:24]!r}, which is not a locked deposit")
            if dep_hash in self.sends:
                rec["error"] = "referenced transaction is not a locked deposit"
                self.violations.append("release targets the SEND txid, not the locked deposit")
        elif dep["release"] is not None:
            rec["error"] = "locked deposit has already been released"
        elif _norm_url(header.get("principal")) != _norm_url(dep["recipient"]):
            rec["error"] = "release must be signed by locked deposit recipient"
            self.violations.append(
                f"release principal {header.get('principal')!r} is not the deposit recipient {dep['recipient']!r}"
            )
        else:
            digest = _ALGOS[dep["algo"]][0](bytes.fromhex(preimage_hex)).hex()
            if digest != dep["hash"]:
                rec["error"] = "preimage does not match hash"
            else:
                rec["ok"] = True
                dep["release"] = release
        self.releases[release] = rec
        return release

    # ------------------------------------------------------------------ query
    def _tx_record(self, h, kind_body, extra=None, status="delivered", status_no=201, error=None, principal=None):
        rec = {
            "recordType": "message",
            "id": f"acc://{h}@{principal or 'unknown'}",
            "status": status,
            "statusNo": status_no,
            "result": {"type": "unknown"},
            "message": {"type": "transaction", "transaction": {"header": {}, "body": {"type": kind_body}}},
        }
        if error:
            rec["error"] = {"message": error, "code": status, "codeID": status_no}
        rec.update(extra or {})
        return rec

    def _query(self, scope, v2):
        h = _hash_of(scope)
        if not h:
            return None
        if h in self.sigs:
            tx = self.sigs[h]
            rec = {
                "recordType": "message",
                "id": f"acc://{h}@unknown",
                "status": "delivered",  # a signature is delivered whatever happens to its transaction
                "statusNo": 201,
                "message": {"type": "signature", "txID": f"acc://{tx}@{self._principal_of(tx)}", "signature": {"type": "ed25519"}},
            }
            return {"result": self._v2(rec) if v2 else rec}
        if h in self.plain:
            p = self.plain[h]
            rec = self._tx_record(h, p["type"], principal=_norm_url(p["principal"]))
            return {"result": self._v2(rec) if v2 else rec}
        if h in self.sends:
            send = self.sends[h]
            send["queries"] += 1
            dep = self.deposits[send["deposit"]]
            produced = {
                "recordType": "range",
                "records": [{"recordType": "txID", "value": f"acc://{send['deposit']}@{_norm_url(dep['recipient'])}"}],
                "start": 0,
                # Kermit reports a total larger than the records it returns; scan the records.
                "total": 2,
            }
            rec = self._tx_record(h, "sendTokens", {"produced": produced}, principal=_norm_url(send["principal"]))
            rec["message"]["transaction"]["header"] = {"principal": send["principal"], "hashLock": send["lock"]}
            return {"result": self._v2(rec) if v2 else rec}
        if h in self.deposits:
            dep = self.deposits[h]
            dep["queries"] += 1
            if dep["queries"] == 1 and not v2:
                return {"error": {"code": -33001, "message": f"transaction {h} not found (notFound)"}}
            result = {"type": "syntheticLockedDeposit"}
            if dep["release"]:
                result["releaseTxID"] = f"acc://{dep['release']}@{_norm_url(dep['recipient'])}"
            rec = self._tx_record(h, "syntheticLockedDeposit", {"result": result}, principal=_norm_url(dep["recipient"]))
            return {"result": self._v2(rec) if v2 else rec}
        if h in self.releases:
            r = self.releases[h]
            r["queries"] += 1
            if r["ok"]:
                dep = self.deposits[r["deposit"]]
                rec = self._tx_record(h, "releaseLockedOperation",
                                      {"result": {"type": "releaseLockedOperation", "preimage": r["preimage"], "hash": dep["hash"]}},
                                      principal=_norm_url(dep["recipient"]))
            else:
                rec = self._tx_record(h, "releaseLockedOperation", status="unauthenticated", status_no=401, error=r["error"])
            return {"result": self._v2(rec) if v2 else rec}
        return None

    @staticmethod
    def _v2(rec):
        """The V2 `query-tx` shape the JS SDK polls: status is an object."""
        ok = rec["status"] == "delivered"
        return {
            "type": "transactionRecord",
            "txid": rec["id"],
            "status": {"code": rec["status"], "delivered": ok, "failed": not ok, "result": rec.get("result", {})},
            "produced": rec.get("produced"),
            "data": rec.get("message", {}).get("transaction", {}),
        }

    # ------------------------------------------------------------------ report
    def summary(self):
        """None when no HTLC traffic was seen; otherwise what the node side observed."""
        if not self.active():
            return None
        return {
            "locked_sends": len(self.sends),
            "lock_algorithms": [s["algo"] for s in self.sends.values()],
            "locked_deposits_found": sum(1 for d in self.deposits.values() if d["queries"] >= 2),
            "releases": [{"ok": r["ok"], "error": r["error"]} for r in self.releases.values()],
            "released_deposits": sum(1 for d in self.deposits.values() if d["release"]),
            "violations": list(self.violations),
        }


HTLC = HtlcMock()
