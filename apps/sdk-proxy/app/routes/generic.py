"""Generic sign-and-submit route for any transaction type."""

import hashlib
import logging

from fastapi import APIRouter

from accumulate_client.tx.builders import get_builder_for
from accumulate_client.convenience import SmartSigner

from ..models import SignAndSubmitRequest, TxResponse

router = APIRouter()
logger = logging.getLogger("generic-route")


def _normalise_body(body: dict) -> None:
    """Fix body fields so they match what _encode_tx_body and Go expect.

    1. IssueTokens / SendTokens: convert flat recipient/amount to the ``to``
       array that the binary encoder and Go protocol require.
    2. Amounts must be strings in JSON (Go unmarshals them as big-int strings).
    """
    body_type = body.get("type", "")

    # -- Convert flat recipient/amount → "to" array for token/credit ops ----
    if body_type in ("issueTokens", "sendTokens", "transferCredits"):
        if body.get("recipient") and "to" not in body:
            amt = body.pop("amount", 0)
            body["to"] = [{"url": body.pop("recipient"), "amount": str(amt)}]

    # -- Credit precision: CreditPrecision = 100 in Go protocol ---------------
    # User enters whole credits (e.g. 3), but the wire format is credit-units
    # (e.g. 300).  Multiply by 100 for burnCredits and transferCredits.
    is_credit_op = body_type in ("transferCredits", "burnCredits")
    CREDIT_PRECISION = 100

    # -- Ensure amounts are strings (Go expects big-int string encoding) ---
    # NOTE: credit op amounts are uint64 (integers), not big-int strings.
    for key in ("amount", "oracle"):
        if key in body and isinstance(body[key], (int, float)):
            if is_credit_op and key == "amount":
                body[key] = int(body[key] * CREDIT_PRECISION)
            elif not is_credit_op:
                body[key] = str(int(body[key]))

    for entry in body.get("to", []):
        if isinstance(entry, dict) and "amount" in entry:
            if is_credit_op:
                val = entry["amount"]
                if isinstance(val, str):
                    val = float(val)
                entry["amount"] = int(val * CREDIT_PRECISION)
            elif isinstance(entry["amount"], (int, float)):
                entry["amount"] = str(int(entry["amount"]))


# Transaction types whose Pydantic models contain ``bytes`` fields.
# For these types we skip the builder's model_validate/model_dump round-trip
# entirely and construct the body dict from the raw fields, because Pydantic v2
# coerces ``str → bytes`` via UTF-8 encoding (not ``bytes.fromhex``), and the
# subsequent ``_normalize_bytes_to_hex`` double-encodes the hex string.
# The binary encoder and Go both accept hex strings directly, so raw fields
# are perfectly fine.
_TYPES_WITH_BYTES_FIELDS = {
    "UpdateKey",
    "UpdateKeyPage",
    "CreateKeyBook",
    "CreateKeyPage",
    "WriteDataTo",         # bypass builder — we build the body dict directly
    "UpdateAccountAuth",   # bypass builder — operations need custom encoding
    "LockAccount",         # bypass builder — SDK encoder missing height field
    "TransferCredits",     # bypass builder — SDK encoder missing to field
    "BurnCredits",         # bypass builder — SDK encoder missing amount field
}


def _to_camel(name: str) -> str:
    """PascalCase → camelCase."""
    if not name:
        return name
    return name[0].lower() + name[1:]


@router.post("/sign-and-submit", response_model=TxResponse)
async def sign_and_submit(req: SignAndSubmitRequest):
    from ..main import store, client

    if client is None:
        return TxResponse(success=False, error="Client not initialized")

    kp = store.get(req.session_id)
    if not kp:
        return TxResponse(success=False, error="No keypair for session")

    try:
        if req.tx_type in _TYPES_WITH_BYTES_FIELDS:
            # Bypass builder to avoid Pydantic double-encoding of bytes fields.
            body = {"type": _to_camel(req.tx_type), **req.fields}
        else:
            builder = get_builder_for(req.tx_type)
            for key, value in req.fields.items():
                builder.with_field(key, value)

            body = builder.to_body()

            # Builders return PascalCase type names (e.g. "CreateToken") but
            # _encode_tx_body expects camelCase (e.g. "createToken") for binary
            # encoding.  Normalise here so the transaction hash is correct.
            if isinstance(body, dict) and body.get("type"):
                t = body["type"]
                body["type"] = t[0].lower() + t[1:]

        if isinstance(body, dict):
            _normalise_body(body)

            # Auto-generate a public key hash for CreateKeyBook / CreateKeyPage
            # when the caller didn't supply one, so the user doesn't have to.
            if body.get("type") == "createKeyBook" and not body.get("publicKeyHash"):
                # Use the SESSION keypair's hash — NOT a random key.
                # The session key must be on the new book's first page so
                # subsequent transactions (CreateKeyPage, etc.) can be signed.
                body["publicKeyHash"] = hashlib.sha256(
                    kp.public_key_bytes()
                ).hexdigest()

            if body.get("type") == "createKeyPage" and not body.get("keys"):
                # For the new page's initial key, use the SESSION keypair
                # so the user can immediately sign with it.
                body["keys"] = [{
                    "keyHash": hashlib.sha256(
                        kp.public_key_bytes()
                    ).hexdigest(),
                }]

            if body.get("type") == "updateKey":
                # The protocol requires newKeyHash (SHA256 of the new public key).
                # The frontend sends newKey (the raw public key hex).
                # Auto-compute newKeyHash if not already provided.
                new_key_hex = body.get("newKey", "")
                if new_key_hex and not body.get("newKeyHash"):
                    body["newKeyHash"] = hashlib.sha256(
                        bytes.fromhex(new_key_hex)
                    ).hexdigest()
                logger.warning(
                    "sign-and-submit updateKey: newKey=%s newKeyHash=%s body_keys=%s",
                    body.get("newKey", "?")[:16],
                    body.get("newKeyHash", "MISSING"),
                    list(body.keys()),
                )

            if body.get("type") == "updateKeyPage":
                # Normalise frontend operations → SDK encoder format.
                # Frontend sends "operations" (plural), encoder reads "operation" (singular).
                # Frontend sends flat {type, key, threshold, ...}, encoder expects
                # {type, entry: {keyHash}, threshold, allow: [...], deny: [...]}.
                raw_ops = body.pop("operations", None) or body.pop("operation", None) or []
                normalised = []
                for op in raw_ops:
                    op_type = op.get("type", "")
                    if op_type in ("add", "remove"):
                        key = op.get("key", "")
                        entry = {"keyHash": key}
                        if op.get("delegate"):
                            entry["delegate"] = op["delegate"]
                        normalised.append({"type": op_type, "entry": entry})
                    elif op_type == "update":
                        normalised.append({
                            "type": "update",
                            "entry": {"keyHash": op.get("oldKey", "")},
                            "newEntry": {"keyHash": op.get("newKey", "")},
                        })
                    elif op_type in ("setThreshold", "setRejectThreshold", "setResponseThreshold"):
                        normalised.append({
                            "type": op_type,
                            "threshold": int(op.get("threshold", 1)),
                        })
                    elif op_type == "updateAllowed":
                        allow = op.get("allow", [])
                        deny = op.get("deny", [])
                        # Support comma-separated strings from the modal
                        if isinstance(allow, str):
                            allow = [s.strip() for s in allow.split(",") if s.strip()]
                        if isinstance(deny, str):
                            deny = [s.strip() for s in deny.split(",") if s.strip()]
                        normalised.append({
                            "type": "updateAllowed",
                            "allow": allow,
                            "deny": deny,
                        })
                    else:
                        normalised.append(op)
                body["operation"] = normalised

                logger.warning(
                    "sign-and-submit updateKeyPage: %d operations",
                    len(normalised),
                )

            if body.get("type") == "writeDataTo":
                # Build proper data entry if only flat entries/strings were supplied
                entries = body.pop("entries", None) or []
                if entries and not body.get("entry"):
                    hex_entries = [
                        e.encode("utf-8").hex() if isinstance(e, str) and not all(
                            c in "0123456789abcdefABCDEF" for c in e
                        ) else e
                        for e in entries
                    ]
                    # Add pubkey hash as external ID for unique-per-keypair account
                    if len(hex_entries) < 2:
                        pub_key_hash = hashlib.sha256(kp.public_key_bytes()).digest()
                        hex_entries.append(pub_key_hash.hex())
                    body["entry"] = {"type": "doubleHash", "data": hex_entries}

                # Auto-compute recipient from entry data if not supplied
                if not body.get("recipient") and body.get("entry"):
                    from .data import _compute_lite_data_account_url
                    body["recipient"] = _compute_lite_data_account_url(
                        body["entry"]["data"]
                    )

                logger.warning(
                    "sign-and-submit writeDataTo: recipient=%s entry_data_count=%d",
                    body.get("recipient", "?"),
                    len(body.get("entry", {}).get("data", [])),
                )

        lta = str(kp.derive_lite_token_account_url("ACME"))
        signer_url = req.signer_url or req.principal or lta

        pub_bytes = kp.public_key_bytes()
        pub_key_hash = hashlib.sha256(pub_bytes).hexdigest()
        algo = getattr(kp, 'algorithm', 'ed25519')
        sig_type = getattr(kp, '_acc_sig_type', 2)

        logger.warning(
            "sign-and-submit: tx_type=%s principal=%s signer_url=%s "
            "algo=%s sig_type=%d pub_key=%s pub_key_hash=%s "
            "body_keys=%s body_type=%s",
            req.tx_type, req.principal, signer_url,
            algo, sig_type,
            pub_bytes.hex(),
            pub_key_hash,
            [k.get("keyHash", "?") for k in body.get("keys", [])] if isinstance(body, dict) else "N/A",
            body.get("type") if isinstance(body, dict) else "N/A",
        )

        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=signer_url)

        # Log signer version fetched from the network
        signer_version = signer.get_signer_version()
        logger.warning(
            "sign-and-submit: signer_version=%d for signer_url=%s",
            signer_version, signer_url,
        )

        if req.wait:
            result = signer.sign_submit_and_wait(
                principal=req.principal,
                body=body,
                memo=req.memo,
            )
            return TxResponse(
                success=result.success,
                tx_hash=getattr(result, "txid", None),
                status="delivered" if result.success else "failed",
                error=str(result.error) if not result.success else None,
            )
        else:
            # sign_and_build returns the envelope, then submit without waiting
            envelope = signer.sign_and_build(
                principal=req.principal,
                body=body,
                memo=req.memo,
            )
            response = client.v3.submit(envelope)
            tx_hash = None
            if isinstance(response, list) and response:
                first = response[0]
                if isinstance(first, dict):
                    tx_hash = first.get("status", {}).get("txID")
            return TxResponse(
                success=True,
                tx_hash=tx_hash,
                status="submitted",
            )

    except Exception as e:
        return TxResponse(success=False, error=str(e))
