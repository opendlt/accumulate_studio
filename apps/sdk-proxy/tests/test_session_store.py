"""Unit tests for the instance-scoped session store."""

import pytest

from app.session_store import AlgoKeypair, SessionCapExceeded, SessionStore


def _kp():
    return AlgoKeypair(
        inner=object(),
        algorithm="ed25519",
        sig_type_num=2,
        sig_type_str="ed25519",
        lite_identity="acc://lid",
        lite_token_account="acc://lid/ACME",
    )


def test_create_returns_token_and_verifies():
    store = SessionStore()
    token = store.create("s1", _kp())
    assert token
    assert store.verify_token("s1", token) is True
    assert store.verify_token("s1", "wrong-token") is False
    assert store.verify_token("unknown", token) is False


def test_state_is_instance_scoped_not_class_level():
    a = SessionStore()
    b = SessionStore()
    a.create("s1", _kp())
    assert a.has("s1") is True
    assert b.has("s1") is False     # would fail if _sessions were a class attribute


def test_ttl_eviction(monkeypatch):
    import app.session_store as ss

    clock = {"now": 1000.0}
    monkeypatch.setattr(ss.time, "time", lambda: clock["now"])

    store = SessionStore()
    store._ttl = 30
    token = store.create("s1", _kp())

    clock["now"] = 1000.0 + 31      # exceed TTL since last_seen
    assert store.get("s1") is None
    assert store.verify_token("s1", token) is False
    assert store.has("s1") is False


def test_get_refreshes_last_seen(monkeypatch):
    import app.session_store as ss

    clock = {"now": 0.0}
    monkeypatch.setattr(ss.time, "time", lambda: clock["now"])

    store = SessionStore()
    store._ttl = 30
    store.create("s1", _kp())

    clock["now"] = 20
    assert store.get("s1") is not None    # touch resets last_seen to 20
    clock["now"] = 45                      # 25s after last touch < ttl
    assert store.get("s1") is not None


def test_session_cap_exceeded():
    store = SessionStore()
    store._max = 2
    store.create("s1", _kp())
    store.create("s2", _kp())
    with pytest.raises(SessionCapExceeded):
        store.create("s3", _kp())
    # Re-creating an existing session is allowed (rotates token, no cap hit).
    assert store.create("s1", _kp())


def test_remove():
    store = SessionStore()
    store.create("s1", _kp())
    store.remove("s1")
    assert store.has("s1") is False
