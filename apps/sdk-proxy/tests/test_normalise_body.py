"""P2-2 — pins the amount-scaling contract enforced by generic._normalise_body.

Credit ops (transferCredits/burnCredits) are scaled ×100 (CreditPrecision) exactly
once, here in the proxy. ACME amounts are only stringified (already ×1e8 in the
engine). The oracle is never scaled.
"""

from app.routes.generic import _normalise_body


def test_transfer_credits_scales_by_100():
    body = {"type": "transferCredits", "amount": 300}
    _normalise_body(body)
    assert body["amount"] == 30000  # 300 credits × 100


def test_burn_credits_amount_scaled():
    body = {"type": "burnCredits", "amount": 5}
    _normalise_body(body)
    assert body["amount"] == 500  # 5 × 100


def test_burn_credits_to_entries_scaled():
    body = {"type": "burnCredits", "to": [{"url": "acc://x", "amount": "5"}]}
    _normalise_body(body)
    assert body["to"][0]["amount"] == 500  # 5 × 100


def test_acme_amount_stringified_not_scaled():
    body = {"type": "sendTokens", "amount": 500000000}
    _normalise_body(body)
    assert body["amount"] == "500000000"  # big-int string, NOT ×anything


def test_oracle_never_scaled():
    body = {"type": "transferCredits", "amount": 1, "oracle": 5000}
    _normalise_body(body)
    assert body["oracle"] == 5000  # untouched
    assert body["amount"] == 100  # credit amount IS scaled (1 × 100)


def test_flat_credit_recipient_converted_and_scaled():
    # transferCredits with flat recipient/amount → to[] array, then ×100.
    body = {"type": "transferCredits", "recipient": "acc://page", "amount": 3}
    _normalise_body(body)
    assert body["to"][0]["url"] == "acc://page"
    assert body["to"][0]["amount"] == 300  # 3 × 100
