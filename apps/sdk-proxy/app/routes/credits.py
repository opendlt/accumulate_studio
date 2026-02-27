"""Add Credits routes."""

from fastapi import APIRouter

from accumulate_client.convenience import SmartSigner, TxBody
from accumulate_client.v3.options import NetworkStatusOptions

from ..models import AddCreditsRequest, TxResponse

router = APIRouter()


@router.post("/add-credits", response_model=TxResponse)
async def add_credits(req: AddCreditsRequest):
    from ..main import store, client

    if client is None:
        return TxResponse(success=False, error="Client not initialized")

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
