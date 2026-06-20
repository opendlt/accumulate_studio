"""Data account operation routes (CreateDataAccount, WriteData, WriteDataTo)."""

import hashlib
import logging
import os

from fastapi import APIRouter, Depends, Request

from accumulate_client.convenience import SmartSigner, TxBody

from ..auth import auth_header, require_signing
from ..net import request_network
from ..models import (
    CreateDataAccountRequest,
    WriteDataRequest,
    WriteDataToRequest,
    TxResponse,
)
from ..rate_limit import RATE_LIMIT_SIGN, limiter

router = APIRouter()
logger = logging.getLogger("data-routes")
_DEBUG_LOG = os.getenv("PROXY_DEBUG_LOGGING", "false").strip().lower() in ("1", "true", "yes", "on")


@router.post("/create-data-account", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_SIGN)
async def create_data_account(
    request: Request,
    req: CreateDataAccountRequest,
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
        lta = str(kp.derive_lite_token_account_url("ACME"))
        principal = req.principal or lta
        signer_url = req.signer_url or lta
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        result = signer.sign_submit_and_wait(
            principal=principal,
            body=TxBody.create_data_account(url=req.url),
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


@router.post("/write-data", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_SIGN)
async def write_data(
    request: Request,
    req: WriteDataRequest,
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
        lta = str(kp.derive_lite_token_account_url("ACME"))
        principal = req.principal or req.account
        signer_url = req.signer_url or lta
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        result = signer.sign_submit_and_wait(
            principal=principal,
            body=TxBody.write_data_strings(entries=req.entries),
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


def _compute_lite_data_account_url(data_hex_list: list[str]) -> str:
    """Compute a lite data account URL from a DoubleHashDataEntry's data array.

    Mirrors Go's ``ComputeLiteDataAccountId`` then ``LiteDataAddress``.

    The chain ID is derived from data[1:] (data[0] is skipped — it holds the
    content, while data[1:] are the external IDs that make the account unique).

    Algorithm::

        hash = SHA256()
        for each item in data[1:]:
            hash.Write(SHA256(bytes.fromhex(item)))
        chain_id = hash.digest()[:32]
        url = "acc://" + chain_id.hex()

    If there are no external IDs (data has only one element), the chain ID
    is SHA256 of nothing (the empty-input hash).
    """
    h = hashlib.sha256()
    for item_hex in data_hex_list[1:]:
        item_hash = hashlib.sha256(bytes.fromhex(item_hex)).digest()
        h.update(item_hash)
    chain_id = h.digest()[:32]
    return f"acc://{chain_id.hex()}"


@router.post("/write-data-to", response_model=TxResponse)
@limiter.limit(RATE_LIMIT_SIGN)
async def write_data_to(
    request: Request,
    req: WriteDataToRequest,
    authorization: str | None = Depends(auth_header),
    net: str = Depends(request_network),
):
    """Write data to a lite data account.

    If ``recipient`` is not supplied the proxy auto-computes the lite data
    account URL from the entry data.  To guarantee a unique-per-keypair
    account the session keypair's public-key hash is injected as an
    external ID (data[1]) when the caller only sends plain content strings.
    """
    from ..main import store, get_client

    require_signing(req.session_id, authorization)
    client = get_client(net)

    kp = store.get(req.session_id)
    if not kp:
        return TxResponse(success=False, error="No keypair for session")

    try:
        lta = str(kp.derive_lite_token_account_url("ACME"))
        principal = req.principal or lta
        signer_url = req.signer_url or lta

        # --- Build the data entry ----------------------------------------
        # Hex-encode the caller's plain-text entries.
        hex_entries = [e.encode("utf-8").hex() for e in req.entries]

        # For a unique-per-keypair lite data account we need at least one
        # external ID (data[1:]).  If the caller only sent content strings,
        # append the session key's public-key hash as an external ID.
        if len(hex_entries) < 2:
            pub_key_hash = hashlib.sha256(kp.public_key_bytes()).digest()
            hex_entries.append(pub_key_hash.hex())

        entry = {
            "type": "doubleHash",
            "data": hex_entries,
        }

        # --- Compute or use supplied recipient ---------------------------
        recipient = req.recipient
        if not recipient:
            recipient = _compute_lite_data_account_url(hex_entries)

        if _DEBUG_LOG:
            logger.debug(
                "write-data-to: recipient=%s principal=%s signer=%s "
                "data_items=%d",
                recipient, principal, signer_url, len(hex_entries),
            )

        # --- Build writeDataTo body --------------------------------------
        body = {
            "type": "writeDataTo",
            "recipient": recipient,
            "entry": entry,
        }

        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        result = signer.sign_submit_and_wait(
            principal=principal,
            body=body,
        )

        if result.success:
            return TxResponse(
                success=True,
                tx_hash=getattr(result, "txid", None),
                status="delivered",
                recipient=recipient,
            )
        else:
            return TxResponse(success=False, error=str(result.error))

    except Exception as e:
        return TxResponse(success=False, error=str(e))
