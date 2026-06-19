"""In-memory keypair session storage (development / single-instance only)."""

from __future__ import annotations

import os
import secrets
import threading
import time
from dataclasses import dataclass


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


class SessionCapExceeded(Exception):
    """Raised when MAX_SESSIONS is reached."""


@dataclass
class _SessionEntry:
    keypair: AlgoKeypair
    token: str
    created_at: float
    last_seen: float


class SessionStore:
    """Instance-scoped keypair storage keyed by session_id.

    Each session holds a freshly minted bearer token that the caller must
    present on every signing request. State is per-instance (NOT a class
    attribute), is evicted after ``SESSION_TTL_SECONDS`` of inactivity, and is
    bounded by ``MAX_SESSIONS``. Single-process only — a multi-worker deploy
    needs a shared store (e.g. Redis); run uvicorn with one worker until then.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _SessionEntry] = {}
        self._lock = threading.Lock()
        self._ttl = int(os.getenv("SESSION_TTL_SECONDS", "1800"))   # 30 min idle
        self._max = int(os.getenv("MAX_SESSIONS", "500"))

    # -- internal ------------------------------------------------------------

    def _evict_expired(self, now: float) -> None:
        dead = [sid for sid, e in self._sessions.items() if now - e.last_seen > self._ttl]
        for sid in dead:
            self._sessions.pop(sid, None)

    # -- public API ----------------------------------------------------------

    def create(self, session_id: str, keypair: AlgoKeypair) -> str:
        """Store a keypair and return a freshly minted bearer token.

        Re-creating an existing session rotates its token and resets its TTL.
        """
        now = time.time()
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._evict_expired(now)
            if session_id not in self._sessions and len(self._sessions) >= self._max:
                raise SessionCapExceeded()
            self._sessions[session_id] = _SessionEntry(
                keypair=keypair, token=token, created_at=now, last_seen=now,
            )
        return token

    def get(self, session_id: str) -> AlgoKeypair | None:
        now = time.time()
        with self._lock:
            self._evict_expired(now)
            entry = self._sessions.get(session_id)
            if entry is None:
                return None
            entry.last_seen = now
            return entry.keypair

    def verify_token(self, session_id: str, token: str) -> bool:
        """Constant-time check that ``token`` belongs to ``session_id``."""
        with self._lock:
            entry = self._sessions.get(session_id)
            if entry is None:
                return False
            ok = secrets.compare_digest(entry.token, token)
            if ok:
                entry.last_seen = time.time()
            return ok

    def remove(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def has(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self._sessions

    def count(self) -> int:
        with self._lock:
            return len(self._sessions)
