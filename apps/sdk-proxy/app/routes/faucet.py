"""Faucet routes."""

import time

from fastapi import APIRouter, Depends, Request

from ..auth import auth_header, require_signing
from ..net import request_network
from ..models import FaucetRequest, TxResponse
from ..rate_limit import RATE_LIMIT_FAUCET, limiter

router = APIRouter()


@router.post("/faucet", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_FAUCET)
async def request_faucet(
    request: Request,
    req: FaucetRequest,
    authorization: str | None = Depends(auth_header),
    net: str = Depends(request_network),
):
    from ..main import get_client

    require_signing(req.session_id, authorization)
    client = get_client(net)

    last_result = None
    for i in range(req.times):
        try:
            result = client.faucet(req.account)
            last_result = result
        except Exception as e:
            return TxResponse(success=False, error=str(e))

        if i < req.times - 1:
            time.sleep(1)

    tx_hash = None
    if last_result is not None:
        if isinstance(last_result, list) and last_result:
            tx_hash = last_result[0].get("status", {}).get("txID")
        elif isinstance(last_result, dict):
            tx_hash = (
                last_result.get("txID")
                or last_result.get("txid")
                or last_result.get("status", {}).get("txID")
                or last_result.get("status", {}).get("txid")
            )

    return TxResponse(
        success=True,
        tx_hash=tx_hash,
        status="submitted",
    )
