"""FastAPI application for the Accumulate Studio SDK Proxy."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from accumulate_client import Accumulate
from accumulate_client.v3.options import NetworkStatusOptions

from .config import get_network_endpoint, get_network_name
from .session_store import SessionStore
from .body_padding import apply_body_padding_patch
from .routes import keys, faucet, credits, identity, tokens, data, query, generic

# Patch the SDK's binary encoder to avoid Go's 64-byte body rejection.
apply_body_padding_patch()

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

store = SessionStore()
client: Accumulate | None = None


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = Accumulate(get_network_endpoint())
    yield
    if client is not None:
        client.close()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Accumulate Studio Proxy",
    description="SDK proxy for transaction building, signing, and submission",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
    try:
        if client is not None:
            ns = client.v3.network_status(NetworkStatusOptions(partition="directory"))
            return {"status": "ok", "network": network, "connected": True}
    except Exception as e:
        return {"status": "degraded", "network": network, "connected": False, "error": str(e)}
    return {"status": "ok", "network": network, "connected": False}


@app.get("/api/oracle")
async def oracle():
    if client is None:
        return {"error": "Client not initialized"}
    try:
        ns = client.v3.network_status(NetworkStatusOptions(partition="directory"))
        return {"oracle": ns.get("oracle", {}).get("price", 0)}
    except Exception as e:
        return {"error": str(e)}
