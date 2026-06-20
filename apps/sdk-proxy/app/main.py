"""FastAPI application for the Accumulate Studio SDK Proxy."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from accumulate_client import Accumulate
from accumulate_client.v3.options import NetworkStatusOptions

from .config import (
    allowed_networks,
    allowed_origins,
    assert_network_allowed,
    endpoint_for,
    get_network_endpoint,
    get_network_name,
)
from .rate_limit import limiter
from .session_store import SessionStore
from .body_padding import apply_body_padding_patch
from .routes import keys, faucet, credits, identity, tokens, data, query, generic

# Patch the SDK's binary encoder to avoid Go's 64-byte body rejection.
apply_body_padding_patch()

logging.basicConfig(level=os.getenv("PROXY_LOG_LEVEL", "INFO").upper())

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

store = SessionStore()

# One Accumulate client per network, created on demand. The deploy-time network
# is also reachable via the `client` alias for health/oracle. Bounded by the
# small fixed NETWORK_ENDPOINTS set.
_clients: dict[str, Accumulate] = {}
client: Accumulate | None = None


def get_client(network: str | None) -> Accumulate:
    """Return (and cache) an Accumulate client for the requested network.

    Falls back to the deploy-time network when none is given. The caller must
    have validated ``network`` against ``allowed_networks()`` (the
    ``request_network`` dependency does this).
    """
    net = network or get_network_name()
    if net not in _clients:
        _clients[net] = Accumulate(endpoint_for(net))
    return _clients[net]


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    assert_network_allowed()                 # fail fast on mainnet / unknown network
    client = get_client(None)                # deploy-network client (also cached)
    yield
    for c in _clients.values():
        c.close()
    client = None


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Accumulate Studio Proxy",
    description="SDK proxy for transaction building, signing, and submission",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Accumulate-Network"],
)

# Mount route modules
app.include_router(keys.router, prefix="/api")
app.include_router(faucet.router, prefix="/api")
app.include_router(credits.router, prefix="/api")
app.include_router(identity.router, prefix="/api")
app.include_router(tokens.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(generic.router, prefix="/api")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    network = get_network_name()
    allowed = sorted(allowed_networks())
    try:
        if client is not None:
            client.v3.network_status(NetworkStatusOptions(partition="directory"))
            return {"status": "ok", "network": network, "allowed": allowed, "connected": True}
    except Exception as e:
        return {"status": "degraded", "network": network, "allowed": allowed, "connected": False, "error": str(e)}
    return {"status": "ok", "network": network, "allowed": allowed, "connected": False}


@app.get("/api/oracle")
async def oracle():
    if client is None:
        return {"error": "Client not initialized"}
    try:
        ns = client.v3.network_status(NetworkStatusOptions(partition="directory"))
        return {"oracle": ns.get("oracle", {}).get("price", 0)}
    except Exception as e:
        return {"error": str(e)}
