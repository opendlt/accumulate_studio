#!/bin/bash
# wave C: reruns of the collision / binary-race invalid runs + wrong-preimage negatives + local-SDK runs
printf '%s\n' \
 "run-e2e2.sh dart published 2" \
 "run-e2e2.sh rust sha256d 1" \
 "run-e2e2.sh javascript sha256d 1" \
 "run-e2e2.sh python wrong 1" \
 "run-e2e2.sh dart wrong 1" \
 "run-e2e2.sh rust wrong 1" \
 "run-local2.sh python 1" \
 "run-local2.sh dart 1" \
 "run-local2.sh rust 1" \
 "run-local2.sh javascript 1" \
 | xargs -P 10 -I{} bash -c "/c/tmp/htlc-p7/{}"
echo WAVEC-DONE >> /c/tmp/htlc-logs/p7-summary.txt
