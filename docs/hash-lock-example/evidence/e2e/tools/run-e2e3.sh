#!/usr/bin/env bash
# P7 live driver (scratch, never committed).
# usage: run-e2e.sh <lang> <mode> <n>      lang: python|javascript|dart|rust|csharp
#        mode: published (release criterion) | sha256d (published SDK, sha256d lock) | wrong (published SDK, wrong preimage, NEGATIVE)
#              | local (the same program against the local SDK; see LOCAL_DIR handling below)
# Writes C:/tmp/htlc-logs/p7-<lang>-<mode>-<n>.log and the independent verdict
# docs/hash-lock-example/evidence/e2e/<lang>-<mode>-<n>.json, and appends one RESULT line to C:/tmp/htlc-logs/p7-summary.txt
# Programs name the ADI adi-<unix seconds>: two programs starting in the same second collide (P7 finding).
# Hold a lock for 20 s after each program start (dart run needs several seconds before main() reads the clock).
claim_slot() { return 0; }  # D-31: no start lock; names no longer collide within a second
lang=$1; mode=$2; n=$3; tag=$lang-$mode-$n
REPO=/c/Accumulate_Stuff/on-boarding-platform/accumulate-studio
EV=$REPO/docs/hash-lock-example/evidence/e2e
L=C:/tmp/htlc-logs; LU=/c/tmp/htlc-logs
mkdir -p $EV $LU
log=$LU/p7-$tag.log; : > $log
export PYTHONUNBUFFERED=1 CARGO_TARGET_DIR=C:/tmp/htlc-p7/_rust-target-$tag DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

if [ "$mode" = local ]; then
  case $lang in
    python) d=C:/tmp/htlc-e2e-python-local-$n ;;
    *) d=C:/tmp/$lang-template-test; [ $lang = javascript ] && d=C:/tmp/js-template-test ;;
  esac
else
  d=C:/tmp/htlc-e2e-$tag
  rm -rf "$d"
fi

variant=""
[ "$mode" = sha256d ] && export HTLC_ALG=sha256d
[ "$mode" = wrong ] && export HTLC_WRONG_PREIMAGE=1
out=$d
[ "$mode" = local ] && [ $lang != python ] && out=C:/tmp/htlc-p7/_local-export-$tag && rm -rf $out
node C:/tmp/htlc-p7/export-p7.bundle.mjs $lang $out >> $log 2>&1 || { echo "RESULT $tag export-failed" >> $LU/p7-summary.txt; exit 9; }
unset HTLC_ALG HTLC_WRONG_PREIMAGE

started=$(date +%s)
echo "=== start $tag $(date -u +%FT%TZ) dir=$d" >> $log
cd "$d" 2>/dev/null || mkdir -p "$d" && cd "$d" || exit 9
ie=0; re=0
case $lang in
  python)
    if [ "$mode" = local ]; then
      # local SDK: the editable-install venv of the local Python SDK repo (plus requests, which the program imports)
      PY=C:/tmp/htlc-venv-pysdk/Scripts/python
      $PY -m pip install -q requests >>$log 2>&1; ie=$?
    else
      python -m venv venv >>$log 2>&1 && ./venv/Scripts/python -m pip install -q -e . >>$log 2>&1; ie=$?
      PY=./venv/Scripts/python
      ./venv/Scripts/python -m pip freeze 2>/dev/null | grep -i "accumulate" >> $log
    fi
    mod=$(ls -d */ | grep -v venv | head -1 | tr -d /)
    if [ "$mode" = local ]; then mkdir -p . ; fi
    [ $ie = 0 ] && claim_slot && $PY -m $mod.main >>$log 2>&1; re=$? ;;
  javascript)
    if [ "$mode" = local ]; then
      cp -f $out/src/index.js ./src/index.js 2>/dev/null || cp -f $out/*.mjs . ; ie=0
      echo "local SDK link: $(node -e "console.log(require('./package.json').dependencies['accumulate-sdk-opendlt'])")" >> $log
    else
      npm install --no-audit --no-fund >>$log 2>&1; ie=$?
      npm ls accumulate-sdk-opendlt 2>/dev/null | grep accumulate >> $log
    fi
    [ $ie = 0 ] && claim_slot && node src/index.js >>$log 2>&1; re=$? ;;
  dart)
    if [ "$mode" = local ]; then cp -rf $out/bin/* ./bin/ ; ie=0; else dart pub get >>$log 2>&1; ie=$?; dart pub deps --no-dev 2>/dev/null | grep -i opendlt >> $log; fi
    [ $ie = 0 ] && claim_slot && dart run >>$log 2>&1; re=$? ;;
  rust)
    if [ "$mode" = local ]; then cp -f $out/src/main.rs ./src/main.rs; fi
    cargo build -q >>$log 2>&1; ie=$?
    grep -A1 'name = "accumulate-sdk"' Cargo.lock >> $log 2>/dev/null
    [ $ie = 0 ] && claim_slot && cargo run -q >>$log 2>&1; re=$? ;;
  csharp)
    if [ "$mode" = local ]; then cp -f $out/Program.cs ./Program.cs; fi
    dotnet build -nologo -v q >>$log 2>&1; ie=$?
    dotnet list package 2>/dev/null | grep -i acme >> $log
    [ $ie = 0 ] && claim_slot && dotnet run --no-build >>$log 2>&1; re=$? ;;
esac
echo "=== end $tag install_exit=$ie run_exit=$re seconds=$(( $(date +%s) - started ))" >> $log

ids=$(python C:/tmp/htlc-p7/extract_ids.py $LU/p7-$tag.log)
send=$(echo "$ids" | sed -n 's/^SEND=//p'); release=$(echo "$ids" | sed -n 's/^RELEASE=//p')
ve=skipped; verdict=$EV/$tag.json
if [ -n "$send" ]; then
  args=(--send "$send" --sender-funded 500000000 --out "$verdict")
  [ -n "$release" ] && args+=(--release "$release")
  if [ "$mode" = wrong ]; then
    args=(--send "$send" --negative --out "$verdict"); [ -n "$release" ] && args+=(--release "$release")
  fi
  python $REPO/docs/hash-lock-example/evidence/p6/verify_htlc.py "${args[@]}" >> $log 2>&1; ve=$?
fi

# Expected outcome: positive modes need install 0, run 0, verify 0; the wrong-preimage mode needs a NON-zero run, the node's error in the log, verify 0
verdict_txt=FAIL
if [ "$mode" = wrong ]; then
  if [ "$ie" = 0 ] && [ "$re" != 0 ] && [ "$ve" = 0 ] && grep -q "preimage does not match hash" $log; then verdict_txt=PASS; fi
else
  if [ "$ie" = 0 ] && [ "$re" = 0 ] && [ "$ve" = 0 ]; then verdict_txt=PASS; fi
fi
echo "RESULT $tag $verdict_txt install=$ie run=$re verify=$ve send=${send:0:40}... release=${release:0:40}..." >> $LU/p7-summary.txt
echo "DONE $tag" >> $log
