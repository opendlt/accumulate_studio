# P2-2 — Amount / precision semantics audit & unification

| Field | Value |
|-------|-------|
| Priority | P2 |
| Severity | Medium |
| Effort | M (2 days) |
| Risk | Medium — touches money math; a wrong fix is a 1e8× error in either direction |
| Depends on | — (independent of P0-2/P0-3) |
| Blocks | — |
| Primary files | `apps/studio/src/services/execution/node-executor.ts`, `apps/sdk-proxy/app/routes/generic.py`, `apps/sdk-proxy/app/routes/credits.py`, `apps/sdk-proxy/app/models.py`, new `node-executor.amount.test.ts`, new `apps/sdk-proxy/tests/test_normalise_body.py` |

---

## 1. Problem & impact

Amount handling crosses four boundaries — **UI input → execution engine (TS) → SDK proxy (Python) → SDK/Go protocol** — and each applies its own scaling. Two different precisions are in play:

- **ACME tokens:** 1 ACME = 1e8 base units (like satoshis).
- **Credits:** the Go protocol's `CreditPrecision = 100`, so 1 credit = 100 credit-units.

Today the scaling is applied inconsistently and in different layers per transaction type. The engine multiplies *every* amount by 1e8 (`parseAmount`), while the proxy multiplies credit amounts by 100 — but only for **some** routes (`generic.py`), not the dedicated `add-credits` route. The risk is double-scaling (1e8× too large) or mis-denomination (treating credits as ACME). The UI also labels AddCredits in "credits" while the value travels as an ACME spend, which is semantically confusing even where the number happens to work.

This doc defines the canonical unit at each boundary, identifies the exact double/mis-scaling sites, and specifies one consistent contract.

## 2. Evidence (current code)

### 2a. Engine: `parseAmount` multiplies everything by 1e8
`node-executor.ts:1296-1304`:
```ts
  private parseAmount(amount: string | number): number {
    if (typeof amount === 'number') return amount;
    const cleaned = amount.replace(/[, ]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      throw new Error(`Invalid amount: ${amount}`);
    }
    return Math.round(num * 1e8);
  }
```
Used by:
- **AddCredits** — `node-executor.ts:287`: `amount: this.parseAmount(amount)` where `amount` defaults to `'5'` (`:277`). So UI "5" → `5 * 1e8 = 500000000` sent to `/api/add-credits`.
- **SendTokens** — `node-executor.ts:561` and `:570`: recipient amounts wrapped in `parseAmount`.
- **WaitForBalance** — `node-executor.ts:659, 675`: also scaled by 1e8 (this is ACME, consistent).

### 2b. Proxy `add-credits` route does NOT apply credit precision
`credits.py:24-40`:
```ts
        oracle = req.oracle
        if oracle is None:
            ns = client.v3.network_status(NetworkStatusOptions(partition="directory"))
            oracle = ns.get("oracle", {}).get("price", 5000)
        lta = str(kp.derive_lite_token_account_url("ACME"))
        signer = SmartSigner(client=client.v3, keypair=kp, signer_url=lta)
        result = signer.sign_submit_and_wait(
            principal=lta,
            body=TxBody.add_credits(
                recipient=req.recipient,
                amount=str(req.amount),   # ← passed straight through, no ×100
                oracle=int(oracle),
            ),
        )
```
`AddCreditsRequest.amount` is typed `int` (`models.py:53-56`). So the route forwards the engine's already-×1e8 value verbatim. **In Accumulate, the AddCredits `amount` field is denominated in ACME base units** (the protocol converts ACME→credits using the oracle), so the ×1e8 from the engine is actually the *correct* unit here — but it is applied in the engine, never documented, and the route does no validation. The number works by accident of `parseAmount`'s blanket ×1e8.

### 2c. Proxy `generic.py` applies CreditPrecision=100, but only for `transferCredits`/`burnCredits`
`generic.py:33-56`:
```py
    is_credit_op = body_type in ("transferCredits", "burnCredits")
    CREDIT_PRECISION = 100

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
```
So `transferCredits`/`burnCredits` amounts get ×100 **here in the proxy**. But these transactions reach the proxy via the *generic* `/sign-and-submit` route (engine's `executeGenericTransaction`), whose amounts may or may not have been through `parseAmount` first — if a credit op's amount went through `parseAmount` (×1e8) in the engine AND ×100 here, that is a catastrophic double/triple scale. The engine path for credit ops must be audited (see step 5.1).

### 2d. Oracle
`add_credits` uses `oracle=int(oracle)` with a fallback `5000` (`credits.py:28, 38`). `generic.py` also stringifies `oracle` for non-credit ops (`:40-44`). Oracle is the ACME/credit price; it is *not* a user amount and must never be ×1e8 or ×100. Confirm no path scales it.

## 3. Root cause

There is no single owner of unit conversion. `parseAmount` blanket-scales ×1e8 in the engine (correct for ACME, wrong concept for credits), and the proxy independently ×100-scales credit ops in one of two routes. Credit vs. ACME denomination is decided implicitly by which route/branch the value happens to traverse, not by an explicit contract.

## 4. Canonical contract (target)

Define the unit at each boundary explicitly. **Amounts are denominated by what the field means in the Accumulate protocol**, and conversion happens exactly once, as close to the user as practical.

| Boundary | ACME token amount (SendTokens, IssueTokens, BurnTokens, AddCredits *spend*) | Credit amount (TransferCredits, BurnCredits) | Oracle |
|----------|------------------------------------------------------------------------------|----------------------------------------------|--------|
| **UI input** | Whole/decimal ACME (e.g. `5`, `1.5`) | Whole credits (e.g. `300`) | price (e.g. `5000`), not user-entered usually |
| **Engine (TS)** | ×1e8 → base units (integer) via `parseAmount` | **×100 → credit-units (integer)** via new `parseCredits`; NOT ×1e8 | pass through unchanged |
| **Proxy (Python)** | accept integer base units, stringify for Go | accept integer credit-units; **do NOT ×100 again** | `int(oracle)`, no scaling |
| **SDK / Go** | big-int string base units | uint64 credit-units | uint64 |

Key decisions:
1. **Conversion happens once, in the engine.** The proxy's job becomes *type coercion* (stringify big-ints) and *defaulting*, not unit conversion. Remove the ×100 from `generic.py` once the engine owns credit scaling — OR keep ×100 in the proxy and ensure the engine does **not** scale credit ops. Pick **proxy-owns-credit-scaling** (less churn, already partially there) and make the engine pass *whole credits* untouched for credit ops. See step 5.
2. **AddCredits `amount` is ACME base units** (protocol semantics). The engine's `parseAmount` (×1e8) is correct; document it and relabel the UI field to "ACME to spend on credits" to remove the credits/ACME confusion. (No numeric change.)

### Acceptance criteria
- [ ] Exactly one layer scales each amount type; no value is scaled twice.
- [ ] TransferCredits/BurnCredits: UI "300 credits" → proxy receives `300` → proxy ×100 → `30000` credit-units to SDK. Engine does NOT ×1e8 these.
- [ ] SendTokens/IssueTokens/BurnTokens: UI "5" ACME → engine ×1e8 → `500000000` → proxy stringifies → SDK.
- [ ] AddCredits: UI "5" → engine ×1e8 → `500000000` ACME base units → proxy passes through (no ×100) → SDK. (documented; field relabeled)
- [ ] Oracle never scaled by 1e8 or 100.
- [ ] Unit tests for `parseAmount`/new `parseCredits` and a proxy test for `_normalise_body` pin the numbers.

## 5. Implementation steps

### Step 5.1 — Audit the engine credit-op path
Find how TransferCredits/BurnCredits amounts reach the proxy. `grep -n "TransferCredits\|BurnCredits\|executeGenericTransaction\|parseAmount" apps/studio/src/services/execution/node-executor.ts`. Determine whether these ops pass `config.amount` through `parseAmount` (×1e8) before hitting `/sign-and-submit`. 
- If they DO call `parseAmount`, that is the double-scale bug (×1e8 in engine, ×100 in proxy). **Fix:** route credit-op amounts through a new `parseCredits` (integer, no ×1e8) instead of `parseAmount`.
- If they do NOT scale (pass raw whole credits), the proxy's ×100 is correct and the engine just needs to keep passing whole integers.

### Step 5.2 — Add an explicit `parseCredits` to the engine
**File:** `node-executor.ts`, next to `parseAmount` (`:1296`):
```ts
  /**
   * Parse a CREDIT amount. Credits are NOT scaled by 1e8 (that's ACME).
   * The proxy applies CreditPrecision (×100); the engine forwards whole credits as an integer.
   */
  private parseCredits(amount: string | number): number {
    if (typeof amount === 'number') return Math.trunc(amount);
    const cleaned = String(amount).replace(/[, ]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) throw new Error(`Invalid credit amount: ${amount}`);
    return Math.trunc(num); // whole credits; proxy scales ×100
  }
```
Update the TransferCredits/BurnCredits executors to use `parseCredits` for `config.amount` (replace any `parseAmount` call on those amounts found in 5.1). Leave SendTokens/IssueTokens/BurnTokens/AddCredits on `parseAmount`.

### Step 5.3 — Make the proxy the single owner of CreditPrecision, idempotently
`generic.py:_normalise_body` already ×100s `transferCredits`/`burnCredits`. Harden it so it cannot double-scale and document the contract. Replace the credit branch comments (`:30-56`) and add a guard against accidental float ACME values:

Before (`:33-56`) — keep structure, tighten semantics:
```py
    is_credit_op = body_type in ("transferCredits", "burnCredits")
    CREDIT_PRECISION = 100

    for key in ("amount", "oracle"):
        if key in body and isinstance(body[key], (int, float)):
            if is_credit_op and key == "amount":
                body[key] = int(body[key] * CREDIT_PRECISION)
            elif not is_credit_op:
                body[key] = str(int(body[key]))
```
After:
```py
    # Credit ops: amount arrives as WHOLE CREDITS from the engine.
    # CreditPrecision = 100 in the Go protocol, applied EXACTLY ONCE, here.
    # ACME ops: amount arrives as base units (already ×1e8 in the engine);
    # the proxy only stringifies for Go's big-int decoding. oracle is never scaled.
    is_credit_op = body_type in ("transferCredits", "burnCredits")
    CREDIT_PRECISION = 100

    for key in ("amount", "oracle"):
        if key in body and isinstance(body[key], (int, float)):
            if key == "oracle":
                body[key] = int(body[key])          # oracle: never scaled
            elif is_credit_op:                       # credit amount → credit-units
                body[key] = int(body[key] * CREDIT_PRECISION)
            else:                                    # ACME base units → big-int string
                body[key] = str(int(body[key]))
```
(The `to[]` entry loop at `:46-56` is already correct; leave it, it scales credit `to` amounts ×100 and stringifies ACME amounts.)

> Note `add-credits` does **not** go through `_normalise_body` (it's a dedicated route), so AddCredits is unaffected by CreditPrecision — correct, since its amount is ACME.

### Step 5.4 — Document AddCredits unit & relabel UI
`credits.py` `add_credits` forwards `str(req.amount)` as ACME base units. Add a clarifying comment and (optionally) validate it's a positive int:
```py
        # req.amount is ACME in BASE UNITS (×1e8 applied in the engine's parseAmount).
        # The protocol converts ACME→credits via the oracle; do NOT apply CreditPrecision here.
        result = signer.sign_submit_and_wait(
            principal=lta,
            body=TxBody.add_credits(
                recipient=req.recipient,
                amount=str(req.amount),
                oracle=int(oracle),
            ),
        )
```
In the AddCredits block config UI (search `grep -rn "AddCredits" apps/studio/src/components` for the field label and `node-executor.ts:275-278` default), relabel the amount field from "credits" to "ACME to spend" and document that the oracle determines how many credits result. No numeric change.

### Step 5.5 — Centralize the unit constants (optional but recommended)
Define `const ACME_PRECISION = 1e8;` and `const CREDIT_PRECISION = 100;` once in the engine and reference them in `parseAmount`/`parseCredits`, mirroring the Python `CREDIT_PRECISION = 100`. Eliminates magic numbers.

## 6. Tests

### Unit — engine (`apps/studio/src/services/execution/node-executor.amount.test.ts`)
Expose `parseAmount`/`parseCredits` for test (either make them non-private behind a test export, or test via a thin wrapper). Cases:
```ts
describe('parseAmount (ACME, ×1e8)', () => {
  it('5 → 500000000', () => expect(parseAmount('5')).toBe(500_000_000));
  it('1.5 → 150000000', () => expect(parseAmount('1.5')).toBe(150_000_000));
  it('strips commas: "1,000" → 100000000000', () => expect(parseAmount('1,000')).toBe(100_000_000_000));
  it('number passthrough: 42 → 42', () => expect(parseAmount(42)).toBe(42));
  it('throws on garbage', () => expect(() => parseAmount('abc')).toThrow());
});

describe('parseCredits (whole credits, NO ×1e8)', () => {
  it('300 → 300', () => expect(parseCredits('300')).toBe(300));
  it('truncates decimals: 3.9 → 3', () => expect(parseCredits('3.9')).toBe(3));
});
```

### Unit — proxy (`apps/sdk-proxy/tests/test_normalise_body.py`)
```python
from app.routes.generic import _normalise_body

def test_transfer_credits_scales_by_100():
    body = {"type": "transferCredits", "amount": 300}
    _normalise_body(body)
    assert body["amount"] == 30000          # 300 credits × 100

def test_burn_credits_to_entries_scaled():
    body = {"type": "burnCredits", "to": [{"url": "acc://x", "amount": "5"}]}
    _normalise_body(body)
    assert body["to"][0]["amount"] == 500   # 5 × 100

def test_acme_amount_stringified_not_scaled():
    body = {"type": "sendTokens", "amount": 500000000}
    _normalise_body(body)
    assert body["amount"] == "500000000"    # big-int string, NOT ×anything

def test_oracle_never_scaled():
    body = {"type": "transferCredits", "amount": 1, "oracle": 5000}
    _normalise_body(body)
    assert body["oracle"] == 5000           # untouched
    assert body["amount"] == 100            # credit amount IS scaled
```

### Numeric end-to-end (documented expectation)
- **TransferCredits:** UI "300 credits" → engine `parseCredits` → `300` → POST `/sign-and-submit` → `_normalise_body` ×100 → `30000` credit-units → SDK uint64 `30000`.
- **SendTokens:** UI "5" ACME → engine `parseAmount` → `500000000` → `_normalise_body` stringifies → `"500000000"` → SDK big-int.
- **AddCredits:** UI "5" → engine `parseAmount` → `500000000` ACME base units → `/add-credits` `str()` → SDK; oracle (e.g. 5000) determines resulting credits, never scaled.

### Manual checklist
- [ ] Execute a TransferCredits of 300 against testnet; confirm recipient gains 300 credits (not 30000 or 3e10).
- [ ] Execute SendTokens of 5 ACME; recipient balance increases by 5 ACME.
- [ ] Execute AddCredits "5"; confirm credits added ≈ 5 ACME × oracle, and no 1e8× blowup.
- [ ] `grep -rn "1e8\|CREDIT_PRECISION\|parseAmount\|parseCredits"` shows scaling only in the documented spots.

## 7. Risks, rollback, out of scope
- **Risk:** if step 5.1 reveals credit ops were already passing whole credits (no engine ×1e8), then introducing `parseCredits` is a no-op and the only real change is documentation — verify before editing executors.
- **Risk:** changing the AddCredits UI label without changing the number is safe; changing the number would be a regression — explicitly do **not** alter AddCredits math.
- **Rollback:** revert `parseCredits` + executor wiring (engine) and the `_normalise_body` comment/guard (proxy) independently.
- **Out of scope:** oracle price *fetching* correctness, supply-limit math on CreateToken, and any UI input validation beyond the AddCredits relabel.
