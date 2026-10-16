"""Hash lock (HTLC) routes: a locked SendTokens and a ReleaseLockedOperation.

These run the REAL SmartSigner (signing, envelope building and the SDK's wait
logic) against a fake v3 client, so what is asserted is what the node would be
sent and how the proxy reports what the node answers. The node's behaviour is
copied from the Kermit observations in docs/hash-lock-example/STATUS.md
("P0.5 observed shapes").
"""

import hashlib
import time

import pytest

from tests.conftest import mint_session

PREIMAGE = bytes(range(32))
HASH_HEX = hashlib.sha256(PREIMAGE).hexdigest()
LOCKED_TX ="acc://" + "ab" * 32 + "@htlc-p6.acme/htlc-receiver"
SEND_TX = "acc://" + "cd" * 32 + "@htlc-p6.acme/htlc-sender"


class _NodeV3:
    """Records every submitted envelope; answers tx queries with a chosen outcome."""

    def __init__(self, outcome):
        self.outcome = outcome          # the dict a query of the txid returns
        self.envelopes = []

    def query(self, scope, *args, **kwargs):
        if "@" in scope:                # a transaction id
            return self.outcome
        return {}                       # signer lookup: version defaults to 1

    def submit(self, envelope, *args, **kwargs):
        self.envelopes.append(envelope)
        return [{"status": {"txID": SEND_TX}}]


DELIVERED = {"status": "delivered", "statusNo": 201}
WRONG_PREIMAGE = {
    "status": "unauthenticated",
    "statusNo": 401,
    "error": {"message": "preimage does not match hash", "code": "unauthenticated", "codeID": 401},
}


@pytest.fixture
def node(api):
    """Swap the fake network client's v3 for one that records submissions."""
    import app.main as main_mod

    def install(outcome=DELIVERED):
        v3 = _NodeV3(outcome)
        main_mod._clients["testnet"].v3 = v3
        return v3

    return install


def _find(obj, key):
    """First value stored under ``key`` anywhere in a nested envelope, else None."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            hit = _find(v, key)
            if hit is not None:
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = _find(v, key)
            if hit is not None:
                return hit
    return None


def _send(api, token, session="sess-htlc", **extra):
    body = {
        "session_id": session,
        "principal": "acc://htlc-p6.acme/htlc-sender",
        "signer_url": "acc://htlc-p6.acme/book/1",
        "recipients": [{"url": "acc://htlc-p6.acme/htlc-receiver", "amount": "100000000"}],
        **extra,
    }
    return api.post("/api/send-tokens", json=body, headers={"Authorization": f"Bearer {token}"})


def _lock(**over):
    return {
        "hash_algorithm": "sha256",
        "hash": HASH_HEX,
        "expiration": int(time.time()) + 30 * 60,
        **over,
    }


def _release(api, token, fields, **extra):
    return api.post(
        "/api/sign-and-submit",
        json={
            "session_id": "sess-htlc",
            "tx_type": "ReleaseLockedOperation",
            "principal": "acc://htlc-p6.acme/htlc-receiver",
            "signer_url": "acc://htlc-p6.acme/book/1",
            "fields": fields,
            **extra,
        },
        headers={"Authorization": f"Bearer {token}"},
    )


# --- Locked SendTokens --------------------------------------------------------

def test_locked_send_puts_the_hash_lock_in_the_header(api, node):
    v3 = node()
    token = mint_session(api, "sess-htlc")
    lock = _lock()

    r = _send(api, token, **lock)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    assert body["tx_hash"] == SEND_TX
    assert len(v3.envelopes) == 1
    sent = _find(v3.envelopes[0], "hashLock")
    assert sent is not None, "the lock never reached the envelope"
    assert sent["hashAlgorithm"] == "sha256"
    assert sent["hash"] == HASH_HEX
    assert sent["expiration"].startswith("20")           # RFC 3339 in JSON
    assert _find(v3.envelopes[0], "type") == "sendTokens"


def test_locked_send_signed_with_a_non_ed25519_key_keeps_the_lock(api, node):
    """The proxy signs RCD1/BTC/ETH keys through its own path: the lock must survive it."""
    v3 = node()
    token = mint_session(api, "sess-rcd", algorithm="rcd1")
    r = _send(api, token, session="sess-rcd", **_lock())
    assert r.json()["success"] is True, r.text
    sent = _find(v3.envelopes[0], "hashLock")
    assert sent is not None and sent["hash"] == HASH_HEX
    assert _find(v3.envelopes[0], "signatures")[0]["type"] == "rcd1"


def test_sha256d_is_forwarded(api, node):
    v3 = node()
    token = mint_session(api, "sess-htlc")
    r = _send(api, token, **_lock(hash_algorithm="sha256d"))
    assert r.json()["success"] is True, r.text
    assert _find(v3.envelopes[0], "hashLock")["hashAlgorithm"] == "sha256d"


def test_send_without_a_lock_has_no_hash_lock(api, node):
    """Positive control for _find: an ordinary send must carry no lock."""
    v3 = node()
    token = mint_session(api, "sess-htlc")
    r = _send(api, token)
    assert r.json()["success"] is True, r.text
    assert len(v3.envelopes) == 1
    assert _find(v3.envelopes[0], "hashLock") is None


@pytest.mark.parametrize(
    "bad",
    [
        {"hash_algorithm": "sha256"},                                 # lock needs all three
        {"hash": HASH_HEX},
        {"expiration": int(time.time()) + 3600},
        {"hash_algorithm": "md5", "hash": HASH_HEX, "expiration": 4102444800},
        {"hash_algorithm": "sha256", "hash": "zz" * 32, "expiration": 4102444800},
    ],
)
def test_incomplete_or_malformed_lock_is_rejected_before_signing(api, node, bad):
    v3 = node()
    token = mint_session(api, "sess-htlc")
    r = _send(api, token, **bad)
    assert r.status_code == 422, r.text
    assert v3.envelopes == []


@pytest.mark.parametrize(
    "over, needle",
    [
        ({"expiration": int(time.time()) + 60}, "expir"),            # under the node's 10 min floor
        ({"expiration": int(time.time()) + 31 * 24 * 3600}, "expir"),  # over 30 days
        ({"hash": "ab" * 20}, "32 bytes"),                          # HASH160-sized hash for sha256
    ],
)
def test_lock_the_node_would_refuse_never_gets_submitted(api, node, over, needle):
    v3 = node()
    token = mint_session(api, "sess-htlc")
    r = _send(api, token, **_lock(**over))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is False
    assert needle in body["error"].lower()
    assert v3.envelopes == []


# --- ReleaseLockedOperation ---------------------------------------------------

def test_release_is_allowed_and_builds_the_node_body(api, node):
    v3 = node()
    token = mint_session(api, "sess-htlc")

    r = _release(api, token, {"lockedTxId": LOCKED_TX, "preimage": PREIMAGE.hex().upper()})

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True and body["status"] == "delivered", body
    assert len(v3.envelopes) == 1
    env = v3.envelopes[0]
    assert _find(env, "type") == "releaseLockedOperation"
    assert _find(env, "lockedTxID") == LOCKED_TX
    assert _find(env, "preimage") == PREIMAGE.hex()             # hex kept as-is, lower-cased
    assert _find(env, "hashLock") is None                       # the lock lives on the SEND only


def test_release_rejected_at_execute_comes_back_failed(api, node):
    """A wrong preimage is accepted at submit and fails at execute: it must read FAILED."""
    v3 = node(WRONG_PREIMAGE)
    token = mint_session(api, "sess-htlc")

    r = _release(api, token, {"lockedTxID": LOCKED_TX, "preimage": "ff" * 32})

    assert r.status_code == 200, r.text
    body = r.json()
    assert len(v3.envelopes) == 1                               # it WAS submitted
    assert body["success"] is False
    assert body["status"] == "failed"
    assert "preimage does not match hash" in body["error"]


@pytest.mark.parametrize(
    "fields",
    [
        {"preimage": PREIMAGE.hex()},                                    # no lockedTxID
        {"lockedTxID": LOCKED_TX},                                       # no preimage
        {"lockedTxID": "not-a-txid", "preimage": PREIMAGE.hex()},
        {"lockedTxID": "acc://" + "ab" * 32, "preimage": PREIMAGE.hex()},  # no @account
        {"lockedTxID": LOCKED_TX, "preimage": "xyz"},                    # not hex
        {"lockedTxID": LOCKED_TX, "preimage": "abc"},                    # odd length
        {"lockedTxID": LOCKED_TX, "preimage": ""},                       # empty
        {"lockedTxID": LOCKED_TX, "preimage": "00" * 257},               # > 256 bytes
    ],
)
def test_malformed_release_is_rejected_before_signing(api, node, fields):
    v3 = node()
    token = mint_session(api, "sess-htlc")
    r = _release(api, token, fields)
    assert r.status_code == 422, r.text
    assert v3.envelopes == []
