"""Network and security configuration for the SDK proxy."""

import os

NETWORK_ENDPOINTS = {
    "mainnet": "https://mainnet.accumulatenetwork.io",
    "testnet": "https://testnet.accumulatenetwork.io",
    "devnet": "https://devnet.accumulatenetwork.io",
    "kermit": "https://kermit.accumulatenetwork.io",
    "local": "http://localhost:26660",
}

# Origins allowed by default when ALLOWED_ORIGINS is unset, so local development
# works out of the box. Production deployments MUST set ALLOWED_ORIGINS to the
# real studio origin(s); the studio itself talks to the proxy same-origin (via
# the Vercel rewrite), so an empty/locked-down list does not break production.
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def allow_mainnet() -> bool:
    return _env_bool("ALLOW_MAINNET", False)


def get_network_name() -> str:
    """Get the current network name."""
    return os.getenv("ACCUMULATE_NETWORK", "testnet")


def is_mainnet() -> bool:
    return get_network_name() == "mainnet"


def assert_network_allowed() -> None:
    """Raise at startup if a forbidden or unknown network is configured."""
    network = get_network_name()
    if network not in NETWORK_ENDPOINTS:
        raise RuntimeError(
            f"ACCUMULATE_NETWORK='{network}' is not a known network "
            f"{sorted(NETWORK_ENDPOINTS)}"
        )
    if network == "mainnet" and not allow_mainnet():
        raise RuntimeError(
            "Refusing to start on mainnet. Set ALLOW_MAINNET=true to override "
            "(you almost certainly do not want this)."
        )


def get_network_endpoint() -> str:
    """Get the Accumulate network endpoint (call assert_network_allowed first)."""
    network = get_network_name()
    return NETWORK_ENDPOINTS.get(network, NETWORK_ENDPOINTS["testnet"])


def allowed_origins() -> list[str]:
    """Browser origins allowed by CORS.

    ALLOWED_ORIGINS is a comma-separated list. When unset, fall back to the
    local-dev origins so development works without configuration. Set it
    explicitly in production to lock cross-origin access to the studio.
    """
    raw = os.getenv("ALLOWED_ORIGINS", "")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins if origins else list(_DEFAULT_DEV_ORIGINS)
