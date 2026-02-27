"""Avoid the Accumulate protocol's 64-byte body rejection.

The Accumulate Go node rejects transaction bodies whose binary encoding
is exactly 64 bytes (a security measure to prevent confusion between
encoded bodies and concatenated hashes).

This module monkey-patches the SDK's binary encoder to:
1. Support the ``$epilogue`` JSON field (extra data appended to the binary
   encoding, matching Go's ``extraData`` field on each transaction type).
2. Automatically detect 64-byte bodies and add a single padding byte via
   ``$epilogue`` so both the Python hash computation and Go's binary
   encoding agree on the padded body.
3. Route non-Ed25519 algorithms (RCD1, BTC, ETH) through a custom signing
   path that uses the correct signature type number in the binary-encoded
   metadata.
4. Fix the writeDataTo body hash to include the recipient URL field
   (the SDK's built-in ``_compute_write_data_body_hash`` only handles
   writeData type=5 and omits the recipient).

Call ``apply_body_padding_patch()`` once at application startup.
"""

import hashlib
import time

import accumulate_client.convenience as _conv

_original_encode_tx_body = _conv._encode_tx_body
_original_compute = _conv._compute_tx_hash_and_sign
_original_write_data_body_hash = _conv._compute_write_data_body_hash


def _sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


# Map frontend/JSON operation types → Go binary enum values.
_ACCOUNT_AUTH_OP_TYPE_MAP = {
    "enable": 1,
    "disable": 2,
    "addAuthority": 3,
    "add": 3,       # frontend shorthand
    "removeAuthority": 4,
    "remove": 4,    # frontend shorthand
}


def _encode_account_auth_operation(op: dict) -> bytes:
    """Encode a single AccountAuthOperation for UpdateAccountAuth.

    Each operation: Field 1 = Type enum, Field 2 = Authority URL.
    """
    parts = bytearray()
    op_type = _ACCOUNT_AUTH_OP_TYPE_MAP.get(op.get("type", ""), 0)
    if op_type:
        parts += _conv._field_uvarint(1, op_type)
    authority = op.get("authority", "")
    if authority:
        parts += _conv._field_string(2, authority)
    return bytes(parts)


def _patched_encode_tx_body(body):
    """Encode body, appending $epilogue bytes if present to match Go.

    Also adds encoding for transaction types the SDK doesn't implement:
    - writeDataTo (type 6)
    - lockAccount (type 16) — height field
    - burnCredits (type 17) — amount field
    - transferCredits (type 18) — to recipients field
    - updateAccountAuth (type 21) — operations field
    """
    body_type = body.get("type", "")
    if body_type == "writeDataTo":
        # Field layout: Field 1 = type 6, Field 2 = recipient, Field 3 = entry
        parts = bytearray()
        parts += _conv._field_uvarint(1, 6)
        if body.get("recipient"):
            parts += _conv._field_string(2, body["recipient"])
        entry = body.get("entry", {})
        entry_bytes = _conv._encode_data_entry(entry)
        if entry_bytes:
            parts += _conv._field_bytes(3, entry_bytes)
        result = bytes(parts)

    elif body_type == "updateAccountAuth":
        # Field layout: Field 1 = type 21, Field 2 = operations (repeated)
        parts = bytearray()
        parts += _conv._field_uvarint(1, 21)
        for op in body.get("operations", []):
            op_bytes = _encode_account_auth_operation(op)
            if op_bytes:
                parts += _conv._field_bytes(2, op_bytes)
        result = bytes(parts)

    elif body_type == "lockAccount":
        # Field layout: Field 1 = type 16, Field 2 = height (uint)
        parts = bytearray()
        parts += _conv._field_uvarint(1, 16)
        height = body.get("height", 0)
        if height:
            parts += _conv._field_uvarint(2, int(height))
        result = bytes(parts)

    elif body_type == "transferCredits":
        # Field layout: Field 1 = type 18, Field 2 = to (repeated CreditRecipient)
        # CreditRecipient: Field 1 = url (string), Field 2 = amount (uint)
        parts = bytearray()
        parts += _conv._field_uvarint(1, 18)
        for recipient in body.get("to", []):
            r_parts = bytearray()
            if recipient.get("url"):
                r_parts += _conv._field_string(1, recipient["url"])
            amt = recipient.get("amount", 0)
            if amt:
                r_parts += _conv._field_uvarint(2, int(amt))
            if r_parts:
                parts += _conv._field_bytes(2, bytes(r_parts))
        result = bytes(parts)

    elif body_type == "burnCredits":
        # Field layout: Field 1 = type 17, Field 2 = amount (uint)
        parts = bytearray()
        parts += _conv._field_uvarint(1, 17)
        amt = body.get("amount", 0)
        if amt:
            parts += _conv._field_uvarint(2, int(amt))
        result = bytes(parts)

    else:
        result = _original_encode_tx_body(body)

    epilogue = body.get("$epilogue")
    if epilogue:
        result = result + bytes.fromhex(epilogue)
    return result


def _patched_write_data_body_hash(body):
    """Compute body hash for writeData and writeDataTo.

    The SDK's built-in version only handles writeData (type=5) and omits
    the recipient field required for writeDataTo (type=6).

    Algorithm (from Go transaction_hash.go hashWriteData):
      1. Copy body, set Entry = nil
      2. MarshalBinary(body-without-entry) → includes type + recipient for writeDataTo
      3. MerkleHash([SHA256(body-without-entry), entry.Hash()])
    """
    body_type = body.get("type", "")
    if body_type != "writeDataTo":
        # For writeData, delegate to original SDK function
        return _original_write_data_body_hash(body)

    # writeDataTo: marshal body-without-entry with type=6 + recipient
    body_parts = bytearray()
    body_parts += _conv._field_uvarint(1, 6)   # writeDataTo = 6
    if body.get("recipient"):
        body_parts += _conv._field_string(2, body["recipient"])
    body_without_entry = bytes(body_parts)

    # Compute entry hash
    entry = body.get("entry", {})
    entry_hash = _conv._data_entry_hash(entry)

    # MerkleHash([SHA256(body_without_entry), entry_hash])
    h1 = _sha256(body_without_entry)
    return _conv._merkle_hash([h1, entry_hash])


# ---------------------------------------------------------------------------
# Non-Ed25519 signing helper
# ---------------------------------------------------------------------------

def _compute_non_ed25519(
    keypair, principal, body, signer_url, signer_version,
    memo=None, timestamp=None,
):
    """Replicate the Ed25519 signing flow with a parameterised sig type.

    The binary encoding of signature metadata is identical across all
    Accumulate signature types — only Field 1 (Type) differs.  We reuse
    the SDK's low-level field helpers for this.
    """
    # -- Public key bytes (AlgoKeypair normalises this) --------------------
    pub_key = keypair.public_key_bytes()

    if timestamp is None:
        timestamp = int(time.time() * 1_000_000)

    # -- Step 1: binary-encode signature metadata -------------------------
    sig_type_num = keypair._acc_sig_type   # 3, 8, 10
    sig_type_str = keypair._acc_sig_str    # "rcd1", "btc", "eth"

    parts = bytearray()
    parts += _conv._field_uvarint(1, sig_type_num)    # Field 1: Type
    parts += _conv._field_bytes(2, pub_key)            # Field 2: PublicKey
    # Field 3: Signature — skipped in metadata
    parts += _conv._field_string(4, signer_url)        # Field 4: Signer URL
    if signer_version != 0:
        parts += _conv._field_uvarint(5, signer_version)
    if timestamp != 0:
        parts += _conv._field_uvarint(6, timestamp)
    sig_metadata_binary = bytes(parts)

    # -- Step 2: initiator -------------------------------------------------
    initiator = _sha256(sig_metadata_binary)

    # -- Step 3: header ----------------------------------------------------
    header_binary = _conv._encode_tx_header(
        principal=principal,
        initiator=initiator,
        memo=memo,
    )

    # -- Step 4: body ------------------------------------------------------
    body_binary = _patched_encode_tx_body(body)

    # -- Step 5: tx_hash ---------------------------------------------------
    header_hash = _sha256(header_binary)
    body_type = body.get("type", "")
    if body_type in ("writeData", "writeDataTo"):
        body_hash = _patched_write_data_body_hash(body)
    else:
        body_hash = _sha256(body_binary)
    tx_hash = _sha256(header_hash + body_hash)

    # -- Step 6: signing preimage ------------------------------------------
    signing_preimage = _sha256(initiator + tx_hash)

    # -- Step 7: sign (AlgoKeypair.sign returns raw bytes) -----------------
    signature = keypair.sign(signing_preimage)

    # -- Step 8: envelope --------------------------------------------------
    transaction = {
        "header": {
            "principal": principal,
            "initiator": initiator.hex(),
        },
        "body": body,
    }
    if memo:
        transaction["header"]["memo"] = memo

    envelope = {
        "transaction": [transaction],
        "signatures": [{
            "type": sig_type_str,
            "publicKey": pub_key.hex(),
            "signature": signature.hex(),
            "signer": signer_url,
            "signerVersion": signer_version,
            "timestamp": timestamp,
        }],
    }

    return envelope, timestamp


# ---------------------------------------------------------------------------
# Patched compute entry-point
# ---------------------------------------------------------------------------

def _patched_compute(
    keypair, principal, body, signer_url, signer_version,
    memo=None, timestamp=None,
):
    """Wrapper that pads 64-byte bodies before signing.

    For Ed25519 (type 2) we delegate to the SDK's proven original path.
    For other algorithms we use our own implementation that parameterises
    the signature type.
    """
    # Pad 64-byte bodies (applies to ALL algorithms)
    encoded = _patched_encode_tx_body(body)
    if len(encoded) == 64:
        body["$epilogue"] = "00"

    # Dispatch based on algorithm
    is_ed25519 = not hasattr(keypair, '_acc_sig_type') or keypair._acc_sig_type == 2
    if is_ed25519:
        return _original_compute(
            keypair, principal, body, signer_url, signer_version, memo, timestamp,
        )
    else:
        return _compute_non_ed25519(
            keypair, principal, body, signer_url, signer_version, memo, timestamp,
        )


# ---------------------------------------------------------------------------
# Patched key page operation encoder (adds missing types)
# ---------------------------------------------------------------------------

# Transaction type name → enum value for updateAllowed allow/deny lists.
_TX_TYPE_NAME_MAP = {
    "createIdentity": 1, "createTokenAccount": 2, "sendTokens": 3,
    "createDataAccount": 4, "writeData": 5, "writeDataTo": 6,
    "acmeFaucet": 7, "createToken": 8, "issueTokens": 9,
    "burnTokens": 10, "createLiteTokenAccount": 11,
    "createKeyPage": 12, "createKeyBook": 13, "addCredits": 14,
    "updateKeyPage": 15, "lockAccount": 16, "burnCredits": 17,
    "transferCredits": 18, "updateAccountAuth": 21, "updateKey": 22,
}

_original_encode_key_page_operation = _conv._encode_key_page_operation


def _patched_encode_key_page_operation(op: dict) -> bytes:
    """Encode a key page operation, adding missing types.

    The SDK only handles update(1), remove(2), add(3), setThreshold(4).
    This adds: updateAllowed(5), setRejectThreshold(6), setResponseThreshold(7).
    """
    op_type = op.get("type", "")

    if op_type == "updateAllowed":
        parts = bytearray()
        parts += _conv._field_uvarint(1, 5)  # updateAllowed = 5
        # Field 2: Allow (repeated enum)
        for tx_name in (op.get("allow") or []):
            val = tx_name if isinstance(tx_name, int) else _TX_TYPE_NAME_MAP.get(tx_name, 0)
            if val:
                parts += _conv._field_uvarint(2, val)
        # Field 3: Deny (repeated enum)
        for tx_name in (op.get("deny") or []):
            val = tx_name if isinstance(tx_name, int) else _TX_TYPE_NAME_MAP.get(tx_name, 0)
            if val:
                parts += _conv._field_uvarint(3, val)
        return bytes(parts)

    if op_type == "setRejectThreshold":
        parts = bytearray()
        parts += _conv._field_uvarint(1, 6)  # setRejectThreshold = 6
        parts += _conv._field_uvarint(2, op.get("threshold", 1))
        return bytes(parts)

    if op_type == "setResponseThreshold":
        parts = bytearray()
        parts += _conv._field_uvarint(1, 7)  # setResponseThreshold = 7
        parts += _conv._field_uvarint(2, op.get("threshold", 1))
        return bytes(parts)

    # Delegate to original for update, remove, add, setThreshold
    return _original_encode_key_page_operation(op)


def apply_body_padding_patch():
    """Monkey-patch the SDK so all transactions avoid the 64-byte ban."""
    _conv._encode_tx_body = _patched_encode_tx_body
    _conv._compute_tx_hash_and_sign = _patched_compute
    _conv._compute_write_data_body_hash = _patched_write_data_body_hash
    _conv._encode_key_page_operation = _patched_encode_key_page_operation
