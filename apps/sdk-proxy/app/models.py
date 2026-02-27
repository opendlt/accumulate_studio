"""Pydantic request/response models for the SDK proxy API."""

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------

class SessionRequest(BaseModel):
    session_id: str


class TxResponse(BaseModel):
    success: bool
    tx_hash: str | None = None
    simple_hash: str | None = None
    status: str | None = None
    error: str | None = None
    recipient: str | None = None   # for writeDataTo: computed lite data account URL


# ---------------------------------------------------------------------------
# Key Generation
# ---------------------------------------------------------------------------

class GenerateKeysRequest(SessionRequest):
    algorithm: str = "ed25519"     # ed25519, rcd1, btc, eth
    store_as_signer: bool = True


class GenerateKeysResponse(BaseModel):
    algorithm: str
    public_key: str
    lite_identity: str
    lite_token_account: str
    public_key_hash: str


# ---------------------------------------------------------------------------
# Faucet
# ---------------------------------------------------------------------------

class FaucetRequest(SessionRequest):
    account: str
    times: int = 1


# ---------------------------------------------------------------------------
# Add Credits
# ---------------------------------------------------------------------------

class AddCreditsRequest(SessionRequest):
    recipient: str
    amount: int
    oracle: float | None = None


# ---------------------------------------------------------------------------
# Create Identity
# ---------------------------------------------------------------------------

class CreateIdentityRequest(SessionRequest):
    url: str
    key_book_url: str | None = None
    key_page_url: str | None = None
    principal: str | None = None
    signer_url: str | None = None


# ---------------------------------------------------------------------------
# Token Operations
# ---------------------------------------------------------------------------

class TokenRecipient(BaseModel):
    url: str
    amount: str


class SendTokensRequest(SessionRequest):
    principal: str
    recipients: list[TokenRecipient]
    signer_url: str | None = None


class CreateTokenAccountRequest(SessionRequest):
    url: str
    token_url: str = "acc://ACME"
    principal: str | None = None
    signer_url: str | None = None


# ---------------------------------------------------------------------------
# Data Operations
# ---------------------------------------------------------------------------

class CreateDataAccountRequest(SessionRequest):
    url: str
    principal: str | None = None
    signer_url: str | None = None


class WriteDataRequest(SessionRequest):
    account: str
    entries: list[str]
    principal: str | None = None
    signer_url: str | None = None


class WriteDataToRequest(SessionRequest):
    recipient: str | None = None   # auto-computed from entries if not provided
    entries: list[str]
    principal: str | None = None
    signer_url: str | None = None


# ---------------------------------------------------------------------------
# Query Operations
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    url: str


class QueryTxRequest(BaseModel):
    tx_hash: str


class QueryDirectoryRequest(BaseModel):
    url: str
    start: int = 0
    count: int = 100


# ---------------------------------------------------------------------------
# Generic Sign and Submit
# ---------------------------------------------------------------------------

class SignAndSubmitRequest(SessionRequest):
    tx_type: str
    principal: str
    signer_url: str | None = None
    fields: dict
    memo: str | None = None
    wait: bool = True


# ---------------------------------------------------------------------------
# Wait for TX
# ---------------------------------------------------------------------------

class WaitForTxRequest(BaseModel):
    tx_hash: str
    max_attempts: int = 30
    delay_ms: int = 2000
