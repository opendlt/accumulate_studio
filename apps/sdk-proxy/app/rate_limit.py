"""Shared rate limiter.

Defined in its own module (not main.py) so route modules can import the limiter
at import time for their decorators without a circular import with main.py.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from .config import _env_bool


def client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting.

    Behind the Vercel rewrite + Caddy, the original client is the leftmost
    X-Forwarded-For entry (Vercel sets it; Caddy appends its peer). We key on
    that for correct per-user limiting in production. This is an anti-abuse
    measure, not a security boundary — the bearer token is the real gate — so a
    direct (non-Vercel) caller spoofing XFF only affects its own limit bucket.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


# Per-route limits are read from the environment at import time so they can be
# tuned per deployment (and pinned low in tests).
RATE_LIMIT_DEFAULT = os.getenv("RATE_LIMIT_DEFAULT", "120/minute")
RATE_LIMIT_GENERATE = os.getenv("RATE_LIMIT_GENERATE", "20/minute")
RATE_LIMIT_FAUCET = os.getenv("RATE_LIMIT_FAUCET", "10/minute")
RATE_LIMIT_SIGN = os.getenv("RATE_LIMIT_SIGN", "60/minute")

limiter = Limiter(
    key_func=client_ip,
    default_limits=[RATE_LIMIT_DEFAULT],
    enabled=_env_bool("RATE_LIMIT_ENABLED", True),
    # Header injection requires a `response: Response` param on every handler;
    # enforcement (429 on exceed) does not. Keep enforcement, skip the headers.
    headers_enabled=False,
)
