#!/usr/bin/env python
"""
adi-setup.py — provision an ADI with a credited key page for tasks that DECLARE
it as a precondition (03, 05, 06, 07, 08).

Why a script and not harness code: creating an ADI requires signing a
transaction, which requires correct binary marshaling of the transaction body.
Reimplementing that inside the harness would mean writing a sixth SDK — and the
Rust and C# SDKs both shipped marshaling bugs, so a hand-rolled harness signer
would be the least trustworthy component in the system.

Instead the harness provisions through the Python SDK, which PROGRESS.md
designates the reference implementation, via its documented canonical
`QuickStart` path. The measurement invariant is preserved:
  - The SDK under test never verifies its own work — assertions are evaluated by
    the harness against chain state over plain JSON-RPC.
  - Setup failures are classified `harness-setup-failed` and excluded from K2,
    exactly like network-flake, so a setup problem can never be scored as an SDK
    defect.

Note: this creates its OWN wallet rather than reusing the harness keypair,
because QuickStart.create_wallet owns key material end to end. The resulting
private key is returned so the agent can sign with the ADI it is handed.

Reads JSON config on stdin, writes JSON to stdout. Nothing else may go to
stdout — the harness parses it.
"""

import contextlib
import json
import sys
import time
import urllib.request


_ENDPOINTS = {
    "kermit": "https://kermit.accumulatenetwork.io/v3",
    "testnet": "https://testnet.accumulatenetwork.io/v3",
    "devnet": "http://127.0.0.1:26660/v3",
}


def _as_url(value):
    """Accept a str or a Url-like object and return a plain string."""
    if value is None:
        return None
    return value if isinstance(value, str) else str(value)


def _query(network: str, scope: str):
    """Query an account over plain JSON-RPC, independent of the SDK."""
    url = _ENDPOINTS.get(network, _ENDPOINTS["kermit"])
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query",
                       "params": {"scope": scope}}).encode()
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _account_exists(network: str, scope: str) -> bool:
    try:
        return "error" not in _query(network, scope)
    except Exception:
        return False


def _wait_for_credits(network: str, scope: str, timeout_s: int = 240):
    """Wait for a key page to report a positive credit balance."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            acct = (_query(network, scope).get("result") or {}).get("account") or {}
            bal = int(acct.get("creditBalance") or 0)
            if bal > 0:
                return bal
        except Exception:
            pass
        time.sleep(5)
    return None


def _wait_for_balance(network: str, scope: str, timeout_s: int = 240) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            acct = (_query(network, scope).get("result") or {}).get("account") or {}
            if int(acct.get("balance") or 0) > 0:
                return True
        except Exception:
            pass
        time.sleep(5)
    return False


def main() -> int:
    cfg = json.load(sys.stdin)
    network = cfg.get("network", "kermit")
    adi_name = cfg["adiName"]
    credits = int(cfg.get("credits", 2000))

    from accumulate_client import QuickStart

    factory = getattr(QuickStart, network, None)
    if factory is None:
        raise RuntimeError(
            f"QuickStart has no factory for network {network!r} "
            f"(available: kermit, testnet, devnet)"
        )
    qs = factory()

    try:
        # QuickStart prints human-readable progress to stdout unconditionally.
        # stdout here is a data channel the harness parses, so every SDK call is
        # wrapped to divert that chatter to stderr. (Worth flagging upstream: a
        # library that writes to stdout breaks any machine-readable caller.)
        with contextlib.redirect_stdout(sys.stderr):
            wallet = qs.create_wallet()
            # A fixed post-faucet sleep is a guess about testnet latency. It was
            # 15s against deposits measured settling in 21-85s, so AddCredits ran
            # against a lite identity that did not exist yet
            # ("load signer: Account...Main not found"), the ADI was never
            # created, and this script still returned ok. Wait for the funds to
            # actually arrive instead of assuming a duration.
            qs.fund_wallet(wallet, times=3, wait_seconds=5)
            # The Wallet exposes `lite_token_account` / `lite_identity`; the
            # `_url`-suffixed names never existed, which is why every record
            # reported liteTokenAccountUrl: null and the wait below never ran.
            lta = _as_url(getattr(wallet, "lite_token_account", None))
            if lta and not _wait_for_balance(network, lta):
                raise RuntimeError(
                    f"faucet funds for {lta} did not settle; cannot provision an ADI"
                )

            adi = qs.setup_adi(wallet, adi_name)
            qs.buy_credits_for_adi(wallet, adi, credits=credits)

            adi_url = getattr(adi, "url", None) or f"acc://{adi_name}.acme"
            key_page_url = getattr(adi, "key_page_url", None) or f"{adi_url}/book/1"
            key_book_url = getattr(adi, "key_book_url", None) or f"{adi_url}/book"

            # Credits are bought with a transaction, so they are not visible the
            # instant the call returns. Reading immediately reported a page with
            # no credits and aborted a provisioning run that had in fact worked.
            credit_balance = _wait_for_credits(network, key_page_url)
            if credit_balance is None:
                page = qs.get_key_page_info(key_page_url)
                credit_balance = getattr(page, "credit_balance", None) if page else None

            # QuickStart downgrades a failed AddCredits to a printed warning, so
            # reaching this point proves nothing. Reporting ok here made the
            # harness wait 240s for an ADI that was never submitted, then blame
            # the SDK under test. Verify on chain before claiming success.
            if not _account_exists(network, adi_url):
                raise RuntimeError(
                    f"ADI {adi_url} was not created on chain (a prerequisite step failed silently)"
                )
            if not credit_balance:
                raise RuntimeError(
                    f"key page {key_page_url} has no credits; it could not sign anything"
                )

        out = {
            "ok": True,
            "adiUrl": adi_url,
            "keyBookUrl": key_book_url,
            "keyPageUrl": key_page_url,
            "keyPageCreditBalance": credit_balance,
            "liteIdentityUrl": _as_url(getattr(wallet, "lite_identity", None)),
            "liteTokenAccountUrl": _as_url(getattr(wallet, "lite_token_account", None)),
            # The ADI KEY PAGE key, not the wallet key.
            #
            # QuickStart.setup_adi generates its OWN keypair for the ADI and puts
            # sha256(that public key) on the key page. Returning the wallet key
            # here handed the agent a key that CANNOT sign for the key page it was
            # also handed — every key-page operation (add credits to the page,
            # rotate a key, satisfy a threshold) would fail as unauthorized.
            # Verified: page held 130bbe90… while sha256(wallet pub) was f13d293f….
            "privateKeyHex": _keypair_private_hex(getattr(adi, "keypair", None)),
            "publicKeyHex": _keypair_public_hex(getattr(adi, "keypair", None)),
            # The wallet (lite) key is still needed to fund and buy credits, so it
            # is returned under its own names rather than silently replaced.
            "litePrivateKeyHex": _wallet_private_hex(wallet),
            "litePublicKeyHex": _wallet_public_hex(wallet),
        }
        json.dump(out, sys.stdout)
        return 0
    finally:
        try:
            with contextlib.redirect_stdout(sys.stderr):
                qs.close()
        except Exception:
            pass


def _wallet_private_hex(wallet):
    kp = getattr(wallet, "keypair", None) or getattr(wallet, "key_pair", None)
    if kp is None:
        return None
    b = kp.private_key_bytes() if hasattr(kp, "private_key_bytes") else None
    return b.hex() if b else None


def _wallet_public_hex(wallet):
    kp = getattr(wallet, "keypair", None) or getattr(wallet, "key_pair", None)
    if kp is None:
        return None
    b = kp.public_key_bytes() if hasattr(kp, "public_key_bytes") else None
    return b.hex() if b else None


def _keypair_private_hex(kp):
    """Private key of a raw keypair (the ADI's own), not a wallet wrapper."""
    if kp is None:
        return None
    b = kp.private_key_bytes() if hasattr(kp, "private_key_bytes") else None
    return b.hex() if b else None


def _keypair_public_hex(kp):
    if kp is None:
        return None
    b = kp.public_key_bytes() if hasattr(kp, "public_key_bytes") else None
    return b.hex() if b else None


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - the harness needs the message, not a traceback
        json.dump({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        sys.exit(1)
