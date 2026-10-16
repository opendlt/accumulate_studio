#!/bin/bash
export PATH="/c/tmp/htlc-venv/Scripts:$PATH" RUN_E2E=1 REQUIRE_TOOLCHAINS=1
cd /c/Accumulate_Stuff/on-boarding-platform/accumulate-studio/packages/codegen || exit 1
S=/c/tmp/htlc-logs/p7-palette-summary.txt; : > $S
npx vitest run action-palette-e2e -t "GenerateHashLock|WaitForLockedDeposit|ReleaseLockedOperation" --reporter=verbose > /c/tmp/htlc-logs/p7-palette-e2e.log 2>&1
echo "palette-e2e exit=$?" >> $S
echo ALLDONE >> $S
