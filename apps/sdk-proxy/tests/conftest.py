"""Shared pytest fixtures and test environment for the SDK proxy.

Environment variables are set here, BEFORE ``app`` is imported anywhere, so the
rate-limit decorators (which read limits at import time) pick up test values.
"""

import os

os.environ.setdefault("ACCUMULATE_NETWORK", "testnet")
os.environ.setdefault("ALLOWED_NETWORKS", "testnet,kermit")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("RATE_LIMIT_ENABLED", "true")
os.environ.setdefault("RATE_LIMIT_DEFAULT", "1000/minute")
os.environ.setdefault("RATE_LIMIT_GENERATE", "1000/minute")
os.environ.setdefault("RATE_LIMIT_SIGN", "1000/minute")
os.environ.setdefault("RATE_LIMIT_FAUCET", "3/minute")   # low, exercised by the rate-limit test
os.environ.setdefault("MAX_SESSIONS", "500")

import pytest
from fastapi.testclient import TestClient


class _FakeV3:
    def network_status(self, *args, **kwargs):
        return {"oracle": {"price": 5000}}

    def query(self, *args, **kwargs):
        return {}

    def submit(self, *args, **kwargs):
        return []


class FakeAccumulate:
    """Minimal stand-in so route bodies can run without real network I/O."""

    def __init__(self):
        self.v3 = _FakeV3()

    def faucet(self, account):
        return {"txID": f"acc://fake@{account}"}

    def close(self):
        pass


@pytest.fixture
def api():
    """A TestClient with a fresh in-memory session store and fake SDK clients.

    Constructed without the lifespan context manager so no real Accumulate
    client is created. Routes resolve their client via ``get_client(net)``, which
    reads the ``_clients`` cache — we pre-seed that cache (per allowed network)
    with fakes so a real network client is never built.
    """
    import app.main as main_mod
    from app.session_store import SessionStore

    main_mod.store = SessionStore()      # isolate session state per test
    fake = FakeAccumulate()
    main_mod.client = fake               # health/oracle alias
    main_mod._clients = {"testnet": fake, "kermit": FakeAccumulate()}
    return TestClient(main_mod.app)


def mint_session(api, session_id="sess-A", algorithm="ed25519"):
    """Generate keys for a session and return its bearer token."""
    resp = api.post(
        "/api/generate-keys",
        json={"session_id": session_id, "algorithm": algorithm, "store_as_signer": True},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    assert token
    return token
