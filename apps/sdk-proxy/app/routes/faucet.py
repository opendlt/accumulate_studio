"""Faucet routes."""

import time

from fastapi import APIRouter

from ..models import FaucetRequest, TxResponse

router = APIRouter()


@router.post("/faucet", response_model=TxResponse)
async def request_faucet(req: FaucetRequest):
    from ..main import client

    if client is None:
        return TxResponse(success=False, error="Client not initialized")

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
