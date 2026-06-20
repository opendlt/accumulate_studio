"""Server-side wait timeout for /api/sign-and-submit."""

import time

from tests.conftest import mint_session


class _SlowSigner:
    """A SmartSigner stand-in whose wait blocks longer than the request allows."""

    def __init__(self, *args, **kwargs):
        pass

    def get_signer_version(self):
        return 1

    def sign_submit_and_wait(self, *args, **kwargs):
        time.sleep(5)  # longer than wait_timeout_ms below
        raise AssertionError("should have timed out before this returns")


def test_sign_and_submit_returns_timeout_status(api, monkeypatch):
    import app.routes.generic as generic

    # LockAccount is in the builder-bypass set, so an empty `fields` reaches the
    # signer directly without complex body building.
    monkeypatch.setattr(generic, "SmartSigner", _SlowSigner)

    token = mint_session(api, "sess-wait")
    started = time.time()
    r = api.post(
        "/api/sign-and-submit",
        json={
            "session_id": "sess-wait",
            "tx_type": "LockAccount",
            "principal": "acc://x.acme/book/1",
            "fields": {},
            "wait": True,
            "wait_timeout_ms": 400,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    elapsed = time.time() - started

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is False
    assert body["status"] == "timeout"
    assert "timed out" in (body.get("error") or "").lower()
    # Returned promptly (~the timeout), not after the 5s sleep.
    assert elapsed < 3, f"handler took {elapsed:.1f}s — wait was not bounded"
