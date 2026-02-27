"""Key generation routes."""

import hashlib

from fastapi import APIRouter

from accumulate_client.crypto.ed25519 import Ed25519KeyPair

from ..models import GenerateKeysRequest, GenerateKeysResponse
from ..session_store import AlgoKeypair

router = APIRouter()


# ---------------------------------------------------------------------------
# Lite URL derivation (works the same for all algorithms)
# ---------------------------------------------------------------------------

def _derive_lite_urls(key_hash_20: bytes) -> tuple[str, str]:
    """Derive lite identity and token account URLs from 20-byte key hash.

    Formula (same across all signature types):
      hex_str  = key_hash[:20].hex()          # 40 hex chars
      checksum = SHA256(hex_str.encode())[:4]  # first 4 bytes
      lite_id  = acc://{hex_str}{checksum.hex()}
      lite_ta  = {lite_id}/ACME
    """
    hex_str = key_hash_20.hex()
    checksum = hashlib.sha256(hex_str.encode("utf-8")).digest()[28:].hex()  # last 4 bytes
    lite_identity = f"acc://{hex_str}{checksum}"
    lite_token_account = f"{lite_identity}/ACME"
    return lite_identity, lite_token_account


# ---------------------------------------------------------------------------
# Per-algorithm key generation helpers
# ---------------------------------------------------------------------------

def _generate_ed25519() -> tuple[object, bytes, bytes, str, str, str]:
    """Generate Ed25519 keypair and compute hashes / URLs.

    Returns (keypair, pub_bytes, key_hash_full, pub_key_hash_hex,
             lite_identity, lite_token_account)
    """
    kp = Ed25519KeyPair.generate()
    pub_bytes = kp.public_key_bytes()
    key_hash_full = hashlib.sha256(pub_bytes).digest()
    key_hash_20 = key_hash_full[:20]
    lid, lta = _derive_lite_urls(key_hash_20)
    return kp, pub_bytes, key_hash_full, key_hash_full.hex(), lid, lta


def _generate_rcd1() -> tuple[object, bytes, bytes, str, str, str]:
    """Generate RCD1 keypair (Ed25519 key with Factom-style hash)."""
    from accumulate_client.signers.rcd1 import get_rcd_hash_from_public_key

    kp = Ed25519KeyPair.generate()
    pub_bytes = kp.public_key_bytes()
    rcd_hash = get_rcd_hash_from_public_key(pub_bytes)   # double SHA256 with RCD prefix, 32 bytes
    key_hash_20 = rcd_hash[:20]
    lid, lta = _derive_lite_urls(key_hash_20)
    return kp, pub_bytes, rcd_hash, rcd_hash.hex(), lid, lta


def _generate_btc() -> tuple[object, bytes, bytes, str, str, str]:
    """Generate BTC keypair (secp256k1 with SHA256 + RIPEMD160 hash)."""
    from accumulate_client.crypto.secp256k1 import Secp256k1KeyPair
    from accumulate_client.signers.btc import btc_hash

    kp = Secp256k1KeyPair.generate()
    pub_bytes = kp.public_key_bytes          # attribute on Secp256k1KeyPair
    key_hash_20 = btc_hash(pub_bytes)        # already 20 bytes
    lid, lta = _derive_lite_urls(key_hash_20)
    # For the full hash hex we report the 20-byte BTC hash (zero-padded would be wrong)
    return kp, pub_bytes, key_hash_20, key_hash_20.hex(), lid, lta


def _generate_eth() -> tuple[object, bytes, bytes, str, str, str]:
    """Generate ETH keypair (secp256k1 with Keccak-256 hash, last 20 bytes)."""
    from accumulate_client.crypto.secp256k1 import Secp256k1KeyPair
    from accumulate_client.signers.eth import eth_hash

    kp = Secp256k1KeyPair.generate()

    # ETH needs the uncompressed public key (65 bytes) for hashing
    if hasattr(kp, '_private_key') and hasattr(kp._private_key, 'public_key'):
        # coincurve path — get uncompressed format
        uncompressed = kp._private_key.public_key.format(compressed=False)
    else:
        # ecdsa fallback — public_key_bytes is already uncompressed (64 bytes, no prefix)
        raw = kp.public_key_bytes
        uncompressed = b'\x04' + raw

    key_hash_20 = eth_hash(uncompressed)     # Keccak256(key[1:])[-20:]
    pub_bytes = kp.public_key_bytes           # compressed for storage/display
    lid, lta = _derive_lite_urls(key_hash_20)
    return kp, pub_bytes, key_hash_20, key_hash_20.hex(), lid, lta


# ---------------------------------------------------------------------------
# Algorithm dispatch table
# ---------------------------------------------------------------------------

_ALGORITHMS: dict[str, tuple[callable, int, str]] = {
    # algorithm -> (generator_fn, sig_type_num, sig_type_str)
    "ed25519": (_generate_ed25519, 2, "ed25519"),
    "rcd1":    (_generate_rcd1,    3, "rcd1"),
    "btc":     (_generate_btc,     8, "btc"),
    "eth":     (_generate_eth,    10, "eth"),
}

_VALID_ALGORITHMS = set(_ALGORITHMS.keys())


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/generate-keys", response_model=GenerateKeysResponse)
async def generate_keys(req: GenerateKeysRequest):
    from ..main import store

    algo = req.algorithm.lower()
    if algo not in _VALID_ALGORITHMS:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported algorithm '{req.algorithm}'. Valid: {sorted(_VALID_ALGORITHMS)}",
        )

    gen_fn, sig_type_num, sig_type_str = _ALGORITHMS[algo]
    kp, pub_bytes, _key_hash, pub_key_hash_hex, lid, lta = gen_fn()

    wrapper = AlgoKeypair(
        inner=kp,
        algorithm=algo,
        sig_type_num=sig_type_num,
        sig_type_str=sig_type_str,
        lite_identity=lid,
        lite_token_account=lta,
    )

    if req.store_as_signer:
        store.store(req.session_id, wrapper)

    return GenerateKeysResponse(
        algorithm=algo,
        public_key=pub_bytes.hex(),
        lite_identity=lid,
        lite_token_account=lta,
        public_key_hash=pub_key_hash_hex,
    )
