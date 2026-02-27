"""Token operation routes (SendTokens, CreateTokenAccount)."""

from fastapi import APIRouter

from accumulate_client.convenience import SmartSigner, TxBody

from ..models import SendTokensRequest, CreateTokenAccountRequest, TxResponse

router = APIRouter()


@router.post("/send-tokens", response_model=TxResponse)
async def send_tokens(req: SendTokensRequest):
    from ..main import store, client

    if client is None:
        return TxResponse(success=False, error="Client not initialized")

    kp = store.get(req.session_id)
    if not kp:
        return TxResponse(success=False, error="No keypair for session")

    try:
        lta = str(kp.derive_lite_token_account_url("ACME"))
        signer_url = req.signer_url or lta
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        if len(req.recipients) == 1:
            body = TxBody.send_tokens_single(
                to_url=req.recipients[0].url,
                amount=req.recipients[0].amount,
            )
        else:
            body = TxBody.send_tokens(
                recipients=[{"url": r.url, "amount": r.amount} for r in req.recipients],
            )

        result = signer.sign_submit_and_wait(
            principal=req.principal,
            body=body,
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


@router.post("/create-token-account", response_model=TxResponse)
async def create_token_account(req: CreateTokenAccountRequest):
    from ..main import store, client

    if client is None:
        return TxResponse(success=False, error="Client not initialized")

    kp = store.get(req.session_id)
    if not kp:
        return TxResponse(success=False, error="No keypair for session")

    try:
        lta = str(kp.derive_lite_token_account_url("ACME"))
        principal = req.principal or lta
        signer_url = req.signer_url or lta
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        result = signer.sign_submit_and_wait(
            principal=principal,
            body=TxBody.create_token_account(
                url=req.url,
                token_url=req.token_url,
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
