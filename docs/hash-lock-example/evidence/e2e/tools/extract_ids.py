#!/usr/bin/env python3
"""Print 'SEND=<txid>' and 'RELEASE=<txid>' found in a generated program's log (empty value when absent).
The ids are only IDENTIFIERS handed to the independent verifier; every claim is checked on chain."""
import re
import sys

text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
TX = r"(acc://[0-9a-fA-F]{64}@[^\s'\"),]+)"
send = release = ""
for line in text.splitlines():
    if not send and re.search(r"hash-?locked|LOCKED", line, re.I) and "SendTokens" in line and "FAILED" not in line:
        m = re.search(TX, line)
        if m:
            send = m.group(1)
    if not release and "ReleaseLockedOperation" in line and "FAILED" not in line:
        m = re.search(TX, line)
        if m:
            release = m.group(1)
print(f"SEND={send}")
print(f"RELEASE={release}")
