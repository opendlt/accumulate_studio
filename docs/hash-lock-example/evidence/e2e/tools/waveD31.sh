#!/bin/bash
# post-D-31 confirmation: one published-registry run per language, all five started together, NO start lock
printf '%s\n' \
 "run-e2e3.sh python postd31 1" \
 "run-e2e3.sh javascript postd31 1" \
 "run-e2e3.sh dart postd31 1" \
 "run-e2e3.sh rust postd31 1" \
 "run-e2e3.sh csharp postd31 1" \
 | xargs -P 5 -I{} bash -c "/c/tmp/htlc-p7/{}"
echo POSTD31-DONE >> /c/tmp/htlc-logs/p7-summary.txt
