"""Per-session bearer-token authentication for signing routes."""

from fastapi import Header, HTTPException

from .config import allow_mainnet, is_mainnet


def require_session_token(session_id: str, authorization: str | None) -> None:
    """Validate that the Authorization bearer token belongs to ``session_id``.

    Raises 401 on any mismatch. ``store`` is imported lazily to avoid a circular
    import with main.py (the same pattern the routes use for ``store``/``client``).
    """
    from .main import store

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not store.verify_token(session_id, token):
        raise HTTPException(status_code=401, detail="Invalid session token")


def assert_signing_allowed() -> None:
    """Block signing on mainnet unless explicitly allowed (defense-in-depth).

    The startup guard (``assert_network_allowed``) already prevents the app from
    booting on mainnet without ``ALLOW_MAINNET``; this is a second line that
    refuses to sign even if the process somehow runs on mainnet.
    """
    if is_mainnet() and not allow_mainnet():
        raise HTTPException(status_code=403, detail="Mainnet signing is disabled")


def require_signing(session_id: str, authorization: str | None) -> None:
    """Combined gate for every signing route: valid token + mainnet guard."""
    require_session_token(session_id, authorization)
    assert_signing_allowed()


async def auth_header(authorization: str | None = Header(default=None)) -> str | None:
    """FastAPI dependency that surfaces the raw Authorization header."""
    return authorization
