"""In-memory keypair session storage (development only)."""

from __future__ import annotations


class AlgoKeypair:
    """Wraps different key types with an Ed25519KeyPair-compatible interface.

    All existing route code calls kp.public_key_bytes(), kp.sign(),
    kp.derive_lite_identity_url() and kp.derive_lite_token_account_url()
    which this wrapper delegates uniformly regardless of algorithm.
    """

    def __init__(
        self,
        inner,
        algorithm: str,
        sig_type_num: int,
        sig_type_str: str,
        lite_identity: str,
        lite_token_account: str,
    ):
        self._inner = inner
        self.algorithm = algorithm
        self._acc_sig_type = sig_type_num    # 2, 3, 8, 10
        self._acc_sig_str = sig_type_str      # "ed25519", "rcd1", "btc", "eth"
        self._lite_identity = lite_identity
        self._lite_token_account = lite_token_account

    # -- public key -----------------------------------------------------------

    def public_key_bytes(self) -> bytes:
        """Return raw public key bytes.

        Ed25519KeyPair exposes .public_key_bytes() as a method.
        Secp256k1KeyPair exposes .public_key_bytes as an attribute.
        """
        pkb = self._inner.public_key_bytes
        return pkb() if callable(pkb) else pkb

    # -- signing --------------------------------------------------------------

    def sign(self, message: bytes) -> bytes:
        """Return raw signature bytes.

        Ed25519KeyPair.sign() returns plain bytes.
        Secp256k1KeyPair.sign() returns a Secp256k1Signature with a
        .signature attribute holding the raw bytes.
        """
        result = self._inner.sign(message)
        return result.signature if hasattr(result, 'signature') else result

    # -- lite URL helpers -----------------------------------------------------

    def derive_lite_identity_url(self) -> str:
        return self._lite_identity

    def derive_lite_token_account_url(self, _token: str = "ACME") -> str:
        return self._lite_token_account


class SessionStore:
    """In-memory keypair storage keyed by session_id (browser tab).

    This is for development use only. Production deployments should use
    encrypted browser storage or a secrets vault.
    """

    _sessions: dict[str, AlgoKeypair] = {}

    def store(self, session_id: str, keypair: AlgoKeypair) -> None:
        self._sessions[session_id] = keypair

    def get(self, session_id: str) -> AlgoKeypair | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def has(self, session_id: str) -> bool:
        return session_id in self._sessions
