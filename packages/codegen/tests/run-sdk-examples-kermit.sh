#!/usr/bin/env bash
# Runs SDK example programs directly against the live Kermit testnet (no mock env →
# each example defaults to Kermit). Reports pass/fail per example by exit code.
# Usage: run-sdk-examples-kermit.sh <set>   where <set> = smoke | canonical
set -u
SET="${1:-smoke}"
RUST=/c/Accumulate_Stuff/opendlt-rust-v2v3-sdk/unified
CS=/c/Accumulate_Stuff/opendlt-c-sharp-v2v3-sdk
PY=/c/Accumulate_Stuff/opendlt-python-v2v3-sdk/unified
DART=/c/Accumulate_Stuff/opendlt-dart-v2v3-sdk/unified
JS=/c/Accumulate_Stuff/opendlt-javascript-v2v3-sdk/javascript
TSX="$JS/node_modules/tsx/dist/cli.mjs"
TIMEOUT=900   # 15 min per example

# Ensure no mock env leaks in (so examples hit real Kermit)
unset ACCUMULATE_V2_URL ACCUMULATE_V3_URL ACCUMULATE_BASE_URL ACCUMULATE_ENDPOINT

if [ "$SET" = "smoke" ]; then
  RUST_EX="example_01_lite_identities"
  CS_EX="Example01_LiteIdentities"
  PY_EX="example_01_lite_identities"
  DART_EX="SDK_Examples_file_1_lite_identities_v3"
  JS_EX="example_01_lite_identities"
elif [ "$SET" = "rest" ]; then
  RUST_EX="example_05_adi_to_adi_transfer example_07_query_operations example_08_query_transactions example_10_threshold_updates example_11_quickstart_demo example_12_multi_signature_workflow example_13_adi_to_adi_transfer_with_header_options"
  CS_EX="Example05_AdiToAdiTransfer Example08_QueryTxSignatures Example10_UpdateKeyPageThreshold Example11_MultiSignatureTypes Example12_QuickstartDemo Example13_AdiToAdiTransferWithHeaderOptions Example14_MemoMetadataMultisig Example15_SignPendingMultisig"
  PY_EX="example_05_adi_to_adi_transfer example_08_query_tx_signatures example_10_update_key_page_threshold example_11_multi_signature_types example_12_quickstart_demo example_13_adi_to_adi_transfer_with_header_options example_14_low_level_adi_creation"
  DART_EX="SDK_Examples_file_5_Send_ACME_ADI_to_ADI_v3 SDK_Examples_file_8_Query_Tx_Signatures_Memo_Data_v3 SDK_Examples_file_10_UpdateKeyPageThreshold_v3 SDK_Examples_file_11_Multi_Signature_Types_v3 SDK_Examples_file_12_AccumulateHelper_Demo_v3 SDK_Examples_file_13_QuickStart_Demo_v3 SDK_Examples_file_14_Adi_to_Adi_Transfer_with_Header_Options"
  JS_EX="example_05_adi_to_adi_transfer example_07_query_operations example_08_query_transactions example_10_threshold_updates example_11_multi_signature_types example_12_quickstart_demo example_13_header_options"
else
  RUST_EX="example_01_lite_identities example_02_adi_creation example_03_token_accounts example_04_data_accounts example_06_custom_tokens example_09_key_management"
  CS_EX="Example01_LiteIdentities Example02_AccumulateIdentities Example03_AdiTokenAccounts Example04_DataAccountsEntries Example06_CustomTokens Example09_KeyManagement"
  PY_EX="example_01_lite_identities example_02_accumulate_identities example_03_adi_token_accounts example_04_data_accounts_entries example_06_custom_tokens example_09_key_management"
  DART_EX="SDK_Examples_file_1_lite_identities_v3 SDK_Examples_file_2_Accumulate_Identities_v3 SDK_Examples_file_3_ADI_Token_Accounts_v3 SDK_Examples_file_4_Data_Accounts_and_Entries_v3 SDK_Examples_file_6_Custom_Tokens_copy_v3 SDK_Examples_file_9_Key_Management_v3"
  JS_EX="example_01_lite_identities example_02_adi_creation example_03_token_accounts example_04_data_accounts example_06_custom_tokens example_09_key_management"
fi

PASS=0; FAIL=0; FAILED_LIST=""
run() { # lang label workdir cmd...
  local lang="$1" label="$2" workdir="$3"; shift 3
  echo "===== [$lang] $label ====="
  local out rc
  out=$(cd "$workdir" && timeout "$TIMEOUT" "$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo "  PASS ($lang/$label)"; PASS=$((PASS+1))
  else
    echo "  FAIL ($lang/$label) rc=$rc"; FAIL=$((FAIL+1)); FAILED_LIST="$FAILED_LIST $lang/$label"
    echo "  --- last lines ---"; echo "$out" | tail -6 | sed 's/^/    /'
  fi
}

for e in $RUST_EX; do run rust "$e" "$RUST" cargo run --quiet --example "$e"; done
for e in $PY_EX;   do run python "$e" "$PY" python "$PY/examples/v3/$e.py"; done
for e in $JS_EX;   do run js "$e" "$JS" node "$TSX" "$JS/examples/v3/$e.ts"; done
for e in $DART_EX; do run dart "$e" "$DART" dart run "example/v3/$e.dart"; done
for e in $CS_EX;   do run csharp "$e" "$CS" dotnet run --project "$CS/examples/v3/$e"; done

echo ""
echo "########## SDK EXAMPLES ON KERMIT: PASS=$PASS FAIL=$FAIL ##########"
[ -n "$FAILED_LIST" ] && echo "FAILED:$FAILED_LIST"
exit $FAIL
