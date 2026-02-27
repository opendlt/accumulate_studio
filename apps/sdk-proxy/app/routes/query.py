"""Query routes (account state, transactions, directories)."""

import time

from fastapi import APIRouter

from accumulate_client.v3.options import RangeOptions

from ..models import QueryRequest, QueryTxRequest, QueryDirectoryRequest, WaitForTxRequest

router = APIRouter()


def _normalize_query_result(result: dict) -> dict:
    """Flatten the SDK query response so account fields are at the top level.

    The V3 SDK may return nested data under ``account`` or ``data`` keys.
    We merge them into the top-level response so callers can access fields
    like ``balance``, ``url``, ``tokenUrl`` directly.
    """
    if not isinstance(result, dict):
        return result
    # Merge nested "account" or "data" dict into top level
    nested = result.get("account") or result.get("data")
    if isinstance(nested, dict):
        merged = {**result, **nested}
        merged["_raw_nested"] = nested
        return merged
    return result


@router.post("/query")
async def query_account(req: QueryRequest):
    from ..main import client

    if client is None:
        return {"success": False, "error": "Client not initialized"}

    try:
        result = client.v3.query(req.url)
        return {"success": True, "data": _normalize_query_result(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/query-tx")
async def query_tx(req: QueryTxRequest):
    from ..main import client

    if client is None:
        return {"success": False, "error": "Client not initialized"}

    try:
        result = client.v3.query(req.tx_hash)
        return {"success": True, "data": _normalize_query_result(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/query-directory")
async def query_directory(req: QueryDirectoryRequest):
    from ..main import client

    if client is None:
        return {"success": False, "error": "Client not initialized"}

    try:
        range_opts = RangeOptions(start=req.start, count=req.count) if req.count else None
        result = client.v3.query_directory(req.url, range_options=range_opts)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/wait-for-tx")
async def wait_for_tx(req: WaitForTxRequest):
    from ..main import client

    if client is None:
        return {"success": False, "error": "Client not initialized"}

    try:
        for attempt in range(req.max_attempts):
            result = client.v3.query(req.tx_hash)
            normalized = _normalize_query_result(result)
            status = normalized.get("status", {})
            if isinstance(status, dict) and (status.get("delivered") or status.get("failed")):
                return {
                    "success": not status.get("failed", False),
                    "data": normalized,
                    "attempts": attempt + 1,
                }
            time.sleep(req.delay_ms / 1000)

        return {"success": False, "error": f"Transaction not confirmed after {req.max_attempts} attempts"}
    except Exception as e:
        return {"success": False, "error": str(e)}
