"""Add Credits routes."""

from fastapi import APIRouter, Depends, Request

from accumulate_client.convenience import SmartSigner, TxBody
from accumulate_client.v3.options import NetworkStatusOptions

from ..auth import auth_header, require_signing
from ..net import request_network
from ..models import AddCreditsRequest, TxResponse
from ..rate_limit import RATE_LIMIT_SIGN, limiter

router = APIRouter()


@router.post("/add-credits", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_SIGN)
async def add_credits(
    request: Request,
    req: AddCreditsRequest,
    authorization: str | None = Depends(auth_header),
    net: str = Depends(request_network),
):
    from ..main import store, get_client

    require_signing(req.session_id, authorization)
    client = get_client(net)

    kp = store.get(req.session_id)
    if not kp:
        return TxResponse(success=False, error="No keypair for session")

    try:
        oracle = req.oracle
        if oracle is None:
            ns = client.v3.network_status(NetworkStatusOptions(partition="directory"))
            oracle = ns.get("oracle", {}).get("price", 5000)

        lta = str(kp.derive_lite_token_account_url("ACME"))
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=lta)

        # req.amount is ACME in BASE UNITS (×1e8 already applied in the engine's parseAmount).
        # The protocol converts ACME→credits via the oracle, so do NOT apply CreditPrecision (×100)
        # here — that is only for TransferCredits/BurnCredits in generic.py. See P2-2.
        result = signer.sign_submit_and_wait(
            principal=lta,
            body=TxBody.add_credits(
                recipient=req.recipient,
                amount=str(req.amount),
                oracle=int(oracle),
            ),
        )

        if result.success:
            return TxResponse(
                success=True,
                tx_hash=getattr(result, "txid", None),
                status="delivered",
            )
        else:
            return TxResponse(success=False, error=str(result.error))

    except Exception as e:
        return TxResponse(success=False, error=str(e))
