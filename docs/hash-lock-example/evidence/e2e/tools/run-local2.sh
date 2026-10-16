#!/usr/bin/env bash
# P7 local-SDK driver (scratch, never committed).
# usage: run-local.sh <lang> <n>
# Exports the SAME generated hash-lock project as the published runs, then swaps ONLY the SDK dependency for the
# path-linked local SDK repo, runs it on Kermit and verifies it independently. Result line in p7-summary.txt.
# Programs name the ADI adi-<unix seconds>: two programs starting in the same second collide (P7 finding).
# Hold a lock for 20 s after each program start (dart run needs several seconds before main() reads the clock).
claim_slot() { until mkdir /c/tmp/htlc-p7/startlock 2>/dev/null; do sleep 0.4; done; ( sleep 20; rmdir /c/tmp/htlc-p7/startlock ) & return 0; }
lang=$1; n=$2; tag=$lang-local-$n
REPO=/c/Accumulate_Stuff/on-boarding-platform/accumulate-studio
EV=$REPO/docs/hash-lock-example/evidence/e2e
LU=/c/tmp/htlc-logs; mkdir -p $EV $LU
log=$LU/p7-$tag.log; : > $log
export PYTHONUNBUFFERED=1 CARGO_TARGET_DIR=C:/tmp/htlc-p7/_rust-target-$tag DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
d=C:/tmp/htlc-e2e-$tag; rm -rf "$d"
node C:/tmp/htlc-p7/export-p7.bundle.mjs $lang $d >> $log 2>&1 || { echo "RESULT $tag export-failed" >> $LU/p7-summary.txt; exit 9; }
cd "$d" || exit 9
started=$(date +%s); ie=0; re=0
echo "=== start $tag $(date -u +%FT%TZ) dir=$d (local SDK)" >> $log
case $lang in
  python)
    python -m venv venv >>$log 2>&1
    ./venv/Scripts/python -m pip install -q -e C:/Accumulate_Stuff/opendlt-python-v2v3-sdk/unified >>$log 2>&1 \
      && ./venv/Scripts/python -m pip install -q requests >>$log 2>&1 \
      && ./venv/Scripts/python -m pip install -q -e . --no-deps >>$log 2>&1; ie=$?
    ./venv/Scripts/python -m pip freeze 2>/dev/null | grep -i "accumulate" >> $log
    mod=$(ls -d */ | grep -v venv | head -1 | tr -d /)
    [ $ie = 0 ] && ./venv/Scripts/python -m $mod.main >>$log 2>&1; re=$? ;;
  javascript)
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.dependencies['accumulate-sdk-opendlt']='file:C:/Accumulate_Stuff/opendlt-javascript-v2v3-sdk/javascript';fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
    npm install --no-audit --no-fund >>$log 2>&1
    node -e "import('accumulate-sdk-opendlt').then(m=>console.log('local SDK import ok, exports:',Object.keys(m).length))" >>$log 2>&1; ie=$?
    [ $ie = 0 ] && claim_slot && node src/index.js >>$log 2>&1; re=$? ;;
  dart)
    sed -i 's#^  opendlt_accumulate: .*#  opendlt_accumulate:\n    path: C:\\Accumulate_Stuff\\opendlt-dart-v2v3-sdk\\unified#' pubspec.yaml
    grep -A1 opendlt pubspec.yaml >> $log
    dart pub get >>$log 2>&1; ie=$?
    [ $ie = 0 ] && claim_slot && dart run >>$log 2>&1; re=$? ;;
  rust)
    sed -i 's#^accumulate-sdk = .*#accumulate-sdk = { path = "C:/Accumulate_Stuff/opendlt-rust-v2v3-sdk/unified" }#' Cargo.toml
    grep accumulate-sdk Cargo.toml >> $log
    cargo build -q >>$log 2>&1; ie=$?
    [ $ie = 0 ] && claim_slot && cargo run -q >>$log 2>&1; re=$? ;;
  csharp)
    sed -i 's#<PackageReference Include="Acme.Net.Sdk" Version="2.5.\*" />#<ProjectReference Include="C:\\Accumulate_Stuff\\opendlt-c-sharp-v2v3-sdk\\src\\Acme.Net.Sdk\\Acme.Net.Sdk.csproj" />#' *.csproj
    grep -n "Reference" *.csproj >> $log
    dotnet build -nologo -v q >>$log 2>&1; ie=$?
    [ $ie = 0 ] && claim_slot && dotnet run --no-build >>$log 2>&1; re=$? ;;
esac
echo "=== end $tag install_exit=$ie run_exit=$re seconds=$(( $(date +%s) - started ))" >> $log

ids=$(python C:/tmp/htlc-p7/extract_ids.py $log)
send=$(echo "$ids" | sed -n 's/^SEND=//p'); release=$(echo "$ids" | sed -n 's/^RELEASE=//p')
ve=skipped
if [ -n "$send" ]; then
  args=(--send "$send" --sender-funded 500000000 --out "$EV/$tag.json"); [ -n "$release" ] && args+=(--release "$release")
  python $REPO/docs/hash-lock-example/evidence/p6/verify_htlc.py "${args[@]}" >> $log 2>&1; ve=$?
fi
v=FAIL; [ "$ie" = 0 ] && [ "$re" = 0 ] && [ "$ve" = 0 ] && v=PASS
echo "RESULT $tag $v install=$ie run=$re verify=$ve send=${send:0:40}... release=${release:0:40}..." >> $LU/p7-summary.txt
echo "DONE $tag" >> $log
