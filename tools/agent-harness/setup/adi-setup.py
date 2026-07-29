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
            qs.fund_wallet(wallet, times=3, wait_seconds=15)

            adi = qs.setup_adi(wallet, adi_name)
            qs.buy_credits_for_adi(wallet, adi, credits=credits)

            adi_url = getattr(adi, "url", None) or f"acc://{adi_name}.acme"
            key_page_url = getattr(adi, "key_page_url", None) or f"{adi_url}/book/1"
            key_book_url = getattr(adi, "key_book_url", None) or f"{adi_url}/book"

            page = qs.get_key_page_info(key_page_url)
            credit_balance = getattr(page, "credit_balance", None) if page else None

        out = {
            "ok": True,
            "adiUrl": adi_url,
            "keyBookUrl": key_book_url,
            "keyPageUrl": key_page_url,
            "keyPageCreditBalance": credit_balance,
            "liteIdentityUrl": getattr(wallet, "lite_identity_url", None),
            "liteTokenAccountUrl": getattr(wallet, "lite_token_account_url", None),
            "privateKeyHex": _wallet_private_hex(wallet),
            "publicKeyHex": _wallet_public_hex(wallet),
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


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - the harness needs the message, not a traceback
        json.dump({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        sys.exit(1)
