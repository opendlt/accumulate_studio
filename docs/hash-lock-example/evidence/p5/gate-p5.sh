#!/usr/bin/env bash
# P5 commit gate: AGENTS.md pre-commit gate plus the runbook extras. Each step logs to its own file;
# the summary file gets one "<step> exit=<code>" line per step and ALLDONE at the end.
cd /c/Accumulate_Stuff/on-boarding-platform/accumulate-studio || exit 1
L=/c/tmp/htlc-logs
S=$L/p5-gate-summary.log
: > $S
export PATH="/c/tmp/htlc-venv/Scripts:$PATH"
export REQUIRE_TOOLCHAINS=1
step() { name=$1; shift; "$@" > $L/p5-gate-$name.log 2>&1; echo "$name exit=$?" >> $S; }
step typecheck npm run typecheck
step test npm test
step validate-manifests npm run validate:manifests
step harness-test npm run harness:test
step validate-canonical npm run validate:canonical
step verify-codegen npm run verify:codegen
step build-mcp npm run build:mcp
step test-mcp npm run test:mcp
step lint npm run lint
( cd apps/sdk-proxy && step proxy-pytest python -m pytest -q )
echo ALLDONE >> $S
