#!/bin/bash
# wave A: reruns of the 4 collision-invalid runs + the next published/sha256d runs (drivers hold a start lock, so starts are >= 4 s apart)
printf '%s\n' \
 "run-e2e2.sh python published 2" \
 "run-e2e2.sh dart published 2" \
 "run-e2e2.sh csharp sha256d 1" \
 "run-e2e2.sh csharp wrong 1" \
 "run-e2e2.sh rust published 2" \
 "run-e2e2.sh python sha256d 1" \
 "run-e2e2.sh dart sha256d 1" \
 "run-e2e2.sh rust sha256d 1" \
 | xargs -P 8 -I{} bash -c "/c/tmp/htlc-p7/{}"
echo WAVEA-DONE >> /c/tmp/htlc-logs/p7-summary.txt
