#!/usr/bin/env python3
"""HTLC reference program (Python, published accumulate-sdk-opendlt 2.5.0) against Kermit.

Usage:  python htlc_ref.py [--wrong-preimage]
Exits non-zero on any failure. Never prints key material.
"""
import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from accumulate_client import Accumulate, NetworkStatusOptions
from accumulate_client.convenience import SmartSigner, TxBody
from accumulate_client.crypto.ed25519 import Ed25519KeyPair
from accumulate_client.tx.header import HashLockOptions  # NOT the top-level export (PY-1)

ENDPOINT = "https://kermit.accumulatenetwork.io"
LOCK_AMOUNT = 100000000  # 1 ACME in base units
WRONG_PREIMAGE = "--wrong-preimage" in sys.argv


def out(key, value):
    print(f"{key}={value}", flush=True)


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def faucet(url, times):
    for i in range(times):
        r = requests.post(
            ENDPOINT + "/v2",
            json={"jsonrpc": "2.0", "method": "faucet", "params": {"url": url}, "id": i + 1},
            timeout=30,
        ).json()
        if "error" in r:
            die(f"faucet failed: {r['error']}")
        time.sleep(2)


def account(client, url):
    try:
        return client.v3.query(url).get("account") or {}
    except Exception:
        return {}


def balance(client, url):
    return int(account(client, url).get("balance", 0))


def wait_for(pred, what, attempts=45, delay=2):
    for _ in range(attempts):
        v = pred()
        if v:
            return v
        time.sleep(delay)
    die(f"timed out waiting for {what}")


def add_credits(client, kp, lid, lta, acme_base_units):
    oracle = client.v3.network_status(NetworkStatusOptions(partition="directory")).get("oracle", {}).get("price", 500000)
    res = SmartSigner(client.v3, kp, lid).sign_submit_and_wait(
        principal=lta, body=TxBody.add_credits(lid, acme_base_units, oracle), max_attempts=30
    )
    if not res.success:
        die(f"AddCredits failed: {res.error}")
    wait_for(lambda: int(account(client, lid).get("creditBalance", 0)) > 0, f"credits on {lid}")


def find_locked_deposit(client, send_txid):
    """First produced record that is a delivered syntheticLockedDeposit."""
    for _ in range(60):
        records = (client.v3.query(send_txid).get("produced") or {}).get("records") or []
        for rec in records:
            produced_id = rec.get("value")
            if not produced_id:
                continue
            try:
                q = client.v3.query(produced_id)
            except Exception:
                continue  # NotFound => not ready yet
            body = ((q.get("message") or {}).get("transaction") or {}).get("body") or {}
            if body.get("type") == "syntheticLockedDeposit" and q.get("status") == "delivered":
                return produced_id
        time.sleep(2)
    die("locked deposit not found among produced records")


def main():
    client = Accumulate(ENDPOINT)
    try:
        s_kp, r_kp = Ed25519KeyPair.generate(), Ed25519KeyPair.generate()
        s_lid, s_lta = s_kp.derive_lite_identity_url(), s_kp.derive_lite_token_account_url("ACME")
        r_lid, r_lta = r_kp.derive_lite_identity_url(), r_kp.derive_lite_token_account_url("ACME")
        out("SENDER_LTA", s_lta)
        out("RECEIVER_LTA", r_lta)

        faucet(s_lta, 2)
        faucet(r_lta, 1)
        wait_for(lambda: balance(client, s_lta) > 0 and balance(client, r_lta) > 0, "faucet funds")

        add_credits(client, s_kp, s_lid, s_lta, "500000000")
        add_credits(client, r_kp, r_lid, r_lta, "300000000")

        before = balance(client, r_lta)
        out("RECEIVER_BALANCE_BEFORE", before)

        # --- lock ---
        preimage = os.urandom(32)
        lock = HashLockOptions(
            hashAlgorithm="hash160",
            hash=hashlib.new("ripemd160", hashlib.sha256(preimage).digest()).digest(),
            expiration=datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=30),
        )
        lock.validate_for_submit()
        sent = SmartSigner(client.v3, s_kp, s_lid).sign_submit_and_wait(
            principal=s_lta,
            body=TxBody.send_tokens_single(r_lta, str(LOCK_AMOUNT)),
            hash_lock=lock,
            max_attempts=45,
        )
        if not sent.success:
            die(f"locked SendTokens failed: {sent.error}")
        out("SEND_TXID", sent.txid)

        locked_txid = find_locked_deposit(client, sent.txid)
        out("LOCKED_TXID", locked_txid)

        after_lock = balance(client, r_lta)
        out("RECEIVER_BALANCE_AFTER_LOCK", after_lock)
        if after_lock != before:
            die(f"receiver balance moved on lock: {before} -> {after_lock}")

        # --- release ---
        reveal = os.urandom(32) if WRONG_PREIMAGE else preimage
        released = SmartSigner(client.v3, r_kp, r_lid).sign_submit_and_wait(
            principal=r_lta,
            body=TxBody.release_locked_operation(locked_txid, reveal),
            max_attempts=45,
        )
        if released.txid:
            out("RELEASE_TXID", released.txid)
        if WRONG_PREIMAGE:
            if released.success:
                die("wrong preimage was accepted by the node")
            die(f"release failed as expected: {released.error}")
        if not released.success:
            die(f"release failed: {released.error}")

        after = wait_for(
            lambda: balance(client, r_lta) == before + LOCK_AMOUNT and balance(client, r_lta),
            "receiver balance to increase by the lock amount",
        )
        out("RECEIVER_BALANCE_AFTER_RELEASE", after)
        out("RESULT", "PASS")
    finally:
        client.close()


if __name__ == "__main__":
    main()
