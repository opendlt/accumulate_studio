"""Integration tests for auth, CORS, tx_type allowlist, rate limiting, logout."""

from tests.conftest import mint_session


def _sign_body(session_id="sess-A", tx_type="SendTokens"):
    return {
        "session_id": session_id,
        "tx_type": tx_type,
        "principal": "acc://principal/ACME",
        "fields": {},
    }


# --- Authentication ---------------------------------------------------------

def test_sign_requires_auth(api):
    r = api.post("/api/sign-and-submit", json=_sign_body())
    assert r.status_code == 401


def test_valid_token_passes_auth(api):
    token = mint_session(api, "sess-A")
    # Valid token + bad tx_type → 422 (proves we got PAST the auth gate).
    r = api.post(
        "/api/sign-and-submit",
        json=_sign_body("sess-A", tx_type="TotallyBogus"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_token_bound_to_its_session(api):
    token = mint_session(api, "sess-A")
    # Same token, DIFFERENT session id → 401.
    r = api.post(
        "/api/sign-and-submit",
        json=_sign_body("sess-OTHER"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401


def test_wrong_token_rejected(api):
    mint_session(api, "sess-A")
    r = api.post(
        "/api/sign-and-submit",
        json=_sign_body("sess-A"),
        headers={"Authorization": "Bearer not-the-real-token"},
    )
    assert r.status_code == 401


def test_faucet_requires_auth(api):
    r = api.post("/api/faucet", json={"session_id": "sess-A", "account": "acc://x/ACME"})
    assert r.status_code == 401


# --- tx_type allowlist ------------------------------------------------------

def test_unknown_tx_type_rejected(api):
    token = mint_session(api, "sess-A")
    r = api.post(
        "/api/sign-and-submit",
        json=_sign_body("sess-A", tx_type="DropDatabase"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


# --- CORS -------------------------------------------------------------------

def test_cors_blocks_foreign_origin(api):
    r = api.options(
        "/api/sign-and-submit",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") != "http://evil.example"


def test_cors_allows_configured_origin(api):
    r = api.options(
        "/api/sign-and-submit",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


# --- Logout -----------------------------------------------------------------

def test_logout_removes_session(api):
    import app.main as main_mod

    token = mint_session(api, "sess-A")
    assert main_mod.store.has("sess-A") is True

    r = api.post(
        "/api/logout",
        json={"session_id": "sess-A"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert main_mod.store.has("sess-A") is False


def test_logout_never_401s_without_token(api):
    mint_session(api, "sess-A")
    r = api.post("/api/logout", json={"session_id": "sess-A"})
    assert r.status_code == 200      # logout always succeeds for the caller


# --- Rate limiting ----------------------------------------------------------

def test_faucet_rate_limited(api):
    # RATE_LIMIT_FAUCET is "3/minute" in the test env (see conftest).
    # Use a dedicated X-Forwarded-For IP so this test gets a fresh per-IP
    # bucket (slowapi counts requests before the handler runs, so the shared
    # "testclient" bucket is polluted by other faucet calls). This also
    # exercises the X-Forwarded-For keyfunc path.
    unique_ip = {"X-Forwarded-For": "203.0.113.99"}
    gen = api.post(
        "/api/generate-keys",
        json={"session_id": "sess-rl", "algorithm": "ed25519", "store_as_signer": True},
        headers=unique_ip,
    )
    assert gen.status_code == 200, gen.text
    headers = {"Authorization": f"Bearer {gen.json()['token']}", **unique_ip}

    statuses = []
    for _ in range(4):
        r = api.post(
            "/api/faucet",
            json={"session_id": "sess-rl", "account": "acc://x/ACME", "times": 1},
            headers=headers,
        )
        statuses.append(r.status_code)
    assert statuses[:3] == [200, 200, 200], statuses
    assert statuses[3] == 429, statuses
