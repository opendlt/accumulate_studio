#!/usr/bin/env python3
"""Compile the P7 evidence index from the verifier JSONs and the program logs (never from the RESULT lines).
Writes docs/hash-lock-example/evidence/e2e/INDEX.md and copies the logs next to the verdicts."""
import json
import os
import re
import shutil
import sys

REPO = "C:/Accumulate_Stuff/on-boarding-platform/accumulate-studio"
EV = f"{REPO}/docs/hash-lock-example/evidence/e2e"
LOGS = "C:/tmp/htlc-logs"
os.makedirs(f"{EV}/logs", exist_ok=True)

LANGS = ["python", "javascript", "dart", "rust", "csharp"]
RUNS = ["published-1", "published-2", "sha256d-1", "wrong-1", "local-1"]
rows, bad = [], []


def sdk(lang, text, mode):
    if mode == "local":
        return "local SDK repo (path-linked)"
    pats = {
        "python": r"accumulate-sdk-opendlt==[\d.]+",
        "javascript": r"accumulate-sdk-opendlt@[\d.]+",
        "dart": r"opendlt_accumulate [\d.]+",
        "csharp": r"Acme\.Net\.Sdk\s+\S+\s+([\d.]+)",
    }
    if lang == "rust":
        m = re.search(r'name = "accumulate-sdk"\s*\n(?:-- *)?version = "([\d.]+)"', text) or re.search(r'accumulate-sdk"\s*\n\W*version = "([\d.]+)"', text)
        return f"accumulate-sdk {m.group(1)} (crates.io)" if m else "accumulate-sdk (crates.io; version not captured)"
    m = re.search(pats[lang], text)
    if not m:
        return "?"
    return (f"Acme.Net.Sdk {m.group(1)} (NuGet)" if lang == "csharp" else m.group(0) + " (registry)")


for lang in LANGS:
    for run in RUNS:
        tag = f"{lang}-{run}"
        mode = run.rsplit("-", 1)[0]
        jpath, lpath = f"{EV}/{tag}.json", f"{LOGS}/p7-{tag}.log"
        if not os.path.exists(jpath) or not os.path.exists(lpath):
            bad.append(f"{tag}: missing evidence")
            continue
        v = json.load(open(jpath, encoding="utf-8"))
        log = open(lpath, encoding="utf-8", errors="replace").read()
        end = re.search(r"=== end \S+ install_exit=(\d+) run_exit=(\d+) seconds=(\d+)", log)
        ie, re_, secs = (end.groups() if end else ("?", "?", "?"))
        passed = sum(1 for c in v["checks"] if c["ok"])
        algo = re.search(r"algorithm:\s*(\S+)", log)
        negative = mode == "wrong"
        ok = v["RESULT"] == "PASS" and ie == "0" and ((re_ != "0") if negative else (re_ == "0"))
        if negative:
            ok = ok and "preimage does not match hash" in log
        if mode == "sha256d":
            ok = ok and algo and algo.group(1) == "sha256d"
        if not ok:
            bad.append(f"{tag}: not a clean pass (verdict={v['RESULT']} install={ie} run={re_})")
        rel = (v.get("release") or "")
        rows.append((lang, run, "PASS" if ok else "FAIL", ie, re_, secs, f"{passed}/{len(v['checks'])}", sdk(lang, log, mode),
                     algo.group(1) if algo else "?", v["send"], rel))
        shutil.copy(lpath, f"{EV}/logs/{tag}.log")

for extra in sorted(os.listdir(f"{EV}")):
    if extra.endswith(("-invalid-collision.json", "-shared-target-dir.json")):
        base = extra[:-5]
        src = f"{LOGS}/p7-{base}.log"
        if os.path.exists(src):
            shutil.copy(src, f"{EV}/logs/{base}.log")

out = ["# P7 live end-to-end evidence (Kermit)", "",
       "One row per run. Every verdict is an INDEPENDENT on-chain check (`../p6/verify_htlc.py`, stdlib only), not the program's own output.",
       "Positive runs: send delivered with the hashLock, locked deposit delivered with `result.releaseTxID` = the release txid, release delivered targeting that deposit with a preimage that hashes to the lock, receiver exactly +100000000, sender exactly 500000000-100000000.",
       "`wrong` runs (negative, test-only wrong preimage): the program must exit non-zero printing the node's `preimage does not match hash`, the deposit must never be released, the receiver unchanged.", "",
       "| lang | run | verdict | install | run exit | seconds | checks | SDK | lock algorithm | send txid | release txid |", "|---|---|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    out.append("| " + " | ".join(str(x) for x in r) + " |")
out += ["", "Files: `<lang>-<run>.json` (raw verifier output with every raw query), `logs/<lang>-<run>.log` (the program's full output).",
        "", "Invalid attempts kept as evidence (not counted): `*-invalid-collision.*` (two programs started in the same second chose the same `adi-<unix seconds>` ADI name; the loser failed loudly, the winner's sender balance was contaminated and the verifier caught it) and `rust-published-2-shared-target-dir.*` (first Rust run 2 used a cargo target dir shared with a concurrent run; re-run with its own)."]
open(f"{EV}/INDEX.md", "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print(f"{len(rows)} runs indexed; problems: {len(bad)}")
for b in bad:
    print("PROBLEM", b)
sys.exit(1 if bad else 0)
