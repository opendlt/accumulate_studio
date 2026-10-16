# P7 driver tooling (scratch tools, kept for reproducibility; paths are this machine's)

These produced `../INDEX.md` and every `../<lang>-<run>.json`. They are NOT part of the product.

- `build-p7.mjs` + `entry-p7.ts`: bundles Studio's own `generateProject()` and the shipped `hash-lock` template, exactly the code path of the UI download. Env `HTLC_ALG=sha256d` and `HTLC_WRONG_PREIMAGE=1` select the two TEST-ONLY variants (never shipped).
- `run-e2e2.sh <lang> <published|sha256d|wrong> <n>`: export to a fresh directory, install from the PUBLIC registry (PyPI / npm / pub.dev / crates.io / NuGet), run on Kermit, extract the txids from the program's log, run the independent verifier, append a result line.
- `run-local2.sh <lang> <n>`: the same generated project with ONLY the SDK dependency swapped for the path-linked local SDK repo.
- `extract_ids.py`: pulls the send and release txids out of a program log. They are only identifiers; every claim is checked on chain by `../../p6/verify_htlc.py`.
- `tally.py`: builds `INDEX.md` from the verifier JSONs and logs (not from the result lines).
- `palette-e2e.sh`: `RUN_E2E=1 vitest run action-palette-e2e -t "GenerateHashLock|WaitForLockedDeposit|ReleaseLockedOperation"` (15 live tests).
- `waveA.sh`, `waveC.sh`: how the runs were launched in parallel. The generated programs name the ADI `adi-<unix seconds>`, so two programs that start in the same second collide: the drivers hold a 20 s start lock around each program start (see `claim_slot`).
