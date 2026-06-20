"""Create Identity routes."""

import os

from fastapi import APIRouter, Depends, Request

from accumulate_client.convenience import SmartSigner, TxBody

from ..auth import auth_header, require_signing
from ..net import request_network
from ..models import CreateIdentityRequest, TxResponse
from ..rate_limit import RATE_LIMIT_SIGN, limiter

router = APIRouter()

_DEBUG_LOG = os.getenv("PROXY_DEBUG_LOGGING", "false").strip().lower() in ("1", "true", "yes", "on")


@router.post("/create-identity", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_SIGN)
async def create_identity(
    request: Request,
    req: CreateIdentityRequest,
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
        lid = str(kp.derive_lite_identity_url())
        lta = str(kp.derive_lite_token_account_url("ACME"))
        key_book_url = req.key_book_url or f"{req.url}/book"

        principal = req.principal or lta
        signer_url = req.signer_url or lta

        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        import hashlib
        import logging
        pub_key_hash = hashlib.sha256(kp.public_key_bytes()).hexdigest()

        logger = logging.getLogger("create-identity")
        if _DEBUG_LOG:
            logger.debug(
                "create-identity: url=%s key_book_url=%s pub_key=%s "
                "pub_key_hash=%s principal=%s signer_url=%s",
                req.url, key_book_url,
                kp.public_key_bytes().hex(),
                pub_key_hash,
                principal, signer_url,
            )

        result = signer.sign_submit_and_wait(
            principal=principal,
            body=TxBody.create_identity(
                url=req.url,
                key_book_url=key_book_url,
                public_key_hash=pub_key_hash,
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
