# Draft core issue: HTLC refund-on-expiry is unreachable; expired locks strand the funds

> **Status: FILED upstream as [work_items/4578](https://gitlab.com/accumulatenetwork/accumulate/-/work_items/4578) ("HTLC: expired locks may never refund").** This file is the original draft the filed issue came from; the upstream issue is the one to follow.
> Target repo: `accumulate-core` (GitLab). Suggested labels: `bug`, `htlc`, `protocol`.

## Summary

A `SendTokens` carrying a `hashLock` that is never released is never refunded to the sender.
`expireLockedDeposit` is meant to refund an unreleased `SyntheticLockedDeposit` when its major-block
expiry fires, but it returns early whenever the deposit's status code is `Delivered`. Every successfully
executed `SyntheticLockedDeposit` is `Delivered` (its release changes only `Result`, never `Code`), so
the refund branch can never run. After expiry a release is also refused (`locked deposit has expired`),
so the tokens are stranded in the locked deposit with no way to move.

## Affected versions

- Verified present in `e1d1db9` (the commit Kermit reports as `v1.4.6.7`), at
  `internal/core/execute/v2/block/msg_transaction.go:773`.
- Verified present on `origin/main` `2c43a6b17`, same file and line.
- Local checkout `d1225f9ac` (v1.4.6.5) has the same code at `:773-775` (function at `:758-803`).
- `git diff d1225f9ac origin/main` over the five HTLC files (`msg_transaction.go`, `release_locked_operation.go`,
  `synthetic_locked_deposit.go`, `send_tokens.go`, `test/e2e/txn_htlc_test.go`) is empty.

## Root cause

`internal/core/execute/v2/block/msg_transaction.go`

```go
// :758  expireLockedDeposit handles expiration of SyntheticLockedDeposit transactions.
// :760  ... need to be refunded to the sender when they expire without being released.
func (x ExpiredTransaction) expireLockedDeposit(...) error {
	...
	status, err := batch.Transaction(txHash[:]).Status().Get()
	...
	// If the transaction was already delivered (released), skip it
	if status != nil && status.Code == errors.Delivered {   // :772-775 (:773 on e1d1db9 / origin/main)
		return nil
	}
	// Mark expired, then produce the refund synthetic (:777-799)
```

The comment says "delivered (released)", but `Delivered` does not mean released:

1. `SyntheticLockedDeposit.Execute` (`internal/core/execute/v2/chain/synthetic_locked_deposit.go:107-113`)
   returns `&protocol.SyntheticLockedDepositResult{ReleaseTxID: nil}` and the transaction finishes
   `Delivered` like any other successfully executed transaction.
2. The release (`chain/release_locked_operation.go:281`) records the release only by setting
   `SyntheticLockedDepositResult.ReleaseTxID` on that same status. `Code` stays `Delivered`.
3. `registerForExpiration` (`synthetic_locked_deposit.go:102,116-149`) schedules the deposit for the
   major-block expiry event, which reaches `expireLockedDeposit` via `expireTransaction`
   (`msg_transaction.go:721-725`).

Therefore at expiry an **unreleased** deposit and a **released** deposit are indistinguishable by `Code`
(both `Delivered`), and the function returns before refunding in both cases.

## Evidence

### Live network (Kermit `v1.4.6.7`, 2026-10-16)

An unreleased locked deposit is already `delivered`, with an empty result. Raw responses are saved in
`docs/hash-lock-example/evidence/p0-probe.json` (`steps.lockedDepositBeforeReleaseRaw`):

```
status:   "delivered"
statusNo: 201
result:   {"type": "syntheticLockedDeposit"}          <- no releaseTxID: not released
```

After the release (`steps.lockedDepositAfterReleaseRaw`) the status is still `delivered`; only the result changes:

```
status:   "delivered"
result:   {"type": "syntheticLockedDeposit", "releaseTxID": "acc://7cf0b1a7...@b9ff0b02.../ACME"}
```

This is exactly the state `expireLockedDeposit` has to tell apart, and `Code` cannot.

### Core's own tests

- `test/e2e/txn_htlc_test.go:733` asserts that a not-yet-released deposit `Delivered()` is true
  ("Locked deposit should be delivered (and registered for expiration)"). So the early return at `:773`
  fires for unreleased deposits.
- `TestHTLC_ExpirationRegistration` (`:671-750`) only proves registration, then releases the lock
  (`:739-740`, "This implicitly tests that unreleased locks would be refundable"). It never lets the
  expiry fire, so the refund branch is never executed by any test.
- `TestHTLC_ExpiredLock` is skipped (`:662-669`): "Simulator block time (GenesisTime 2022) differs from wall
  clock time used in validation".
- `TestHTLC_CrossChainSwap_AliceRefundAfterExpiry` (`:1054-1061`) states: "The actual refund mechanism on
  Accumulate is not yet implemented". It only exercises the mock Ethereum side.

## Impact

- A sender who locks tokens that the recipient never claims loses them permanently. Nothing in the
  protocol returns them.
- This is the safety half of an HTLC. Cross-chain swaps rely on "if the counterparty never reveals, I get
  my funds back after the timeout". On Accumulate that guarantee does not hold today.
- Downstream docs describe a refund that does not happen. For example, the SDK `llms.txt` files say the
  tokens are "refunded to the sender".

## Suggested fix

Gate on whether the deposit was actually released, not on the status code:

```go
// Skip only if a ReleaseLockedOperation already released this deposit.
if status != nil {
	if res, ok := status.Result.(*protocol.SyntheticLockedDepositResult); ok && res.ReleaseTxID != nil {
		return nil
	}
}
```

Two follow-ups for the same change:

- After the fix the function overwrites the status with `{Code: Expired}` (`:778-781`), which drops the
  `Result`. Check that is the intended end state for a refunded deposit and that a later release attempt
  still reports `locked deposit has expired` (`release_locked_operation.go:183-185`).
- Add a regression test that really lets the expiry fire and asserts the sender is credited
  (`SyntheticDepositTokens{IsRefund: true}`, or `SyntheticBurnTokens` for `IsIssuer`), and that a
  *released* deposit is **not** refunded. The existing skip reason (simulator block time is 2022, validation
  uses `time.Now()`) must be solved for that test to be possible. See the related note below.

## Related observation (source reading only; not reproduced)

`chain/send_tokens.go` validates the hash-lock window with `time.Until(*lock.Expiration)` (wall clock) in
the same function that runs at both submit and execute. The release path instead compares against the system
ledger timestamp (`release_locked_operation.go:176-185`). Mixing a wall-clock check into execution is also
what makes the expiry scenario untestable in the simulator. Whoever fixes the refund may want to decide
whether the 10-minute and 30-day bounds should use block time at execute. This is noted for the maintainers'
judgement and is not part of the defect above.

## Workaround for users until fixed

None on-chain. Use small amounts, and make sure the recipient releases before the lock expires.
Accumulate Studio's Hash Lock example always releases and does not promise a refund.
