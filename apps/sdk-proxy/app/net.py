"""Per-request network resolution + validation (X-Accumulate-Network header)."""

from fastapi import Header, HTTPException

from .config import allowed_networks, get_network_name


async def request_network(x_accumulate_network: str | None = Header(default=None)) -> str:
    """Resolve the network for this request.

    Uses the X-Accumulate-Network header when present, else the deploy default.
    Rejects (400) any network not in the proxy's allowlist, so the proxy never
    routes to a network it was not configured to serve.
    """
    net = (x_accumulate_network or get_network_name()).strip()
    if net not in allowed_networks():
        raise HTTPException(
            status_code=400,
            detail=f"Network '{net}' not permitted by this proxy",
        )
    return net
