# RB-06 — Devcontainers for all six repos

**KPIs affected:** K2 (removes the `install-fail` failure class), K4
**Depends on:** RB-03 (the manifest states the commands; the container guarantees they run)
**Pairs with:** RB-03 — a devcontainer without an `AGENTS.md` is a machine with no instructions, and vice versa

---

## Why

Verified: **no `.devcontainer` directory and no `devcontainer.json` exists in any of the six repos.** The only Dockerfile is `apps/sdk-proxy/Dockerfile`, which is deployment infrastructure for the proxy service, not an agent workspace.

The consequence: an agent asked to contribute to any of these repos must first correctly provision a toolchain on the host. Across the fleet that means Rust, Dart ≥3.3.0 <4.0.0, .NET 9, Python, and Node ≥18 — plus `bsdtar`/`unzip` for `artifact-verify` and a Python environment for `sdk-proxy`. The highest-friction possible first move, and it happens before any useful work.

This is also the pillar where the gap is total rather than partial. MCP is 1-of-3 primitives; AGENTS.md is right-file-wrong-genre; typed surfaces are 3-of-5. Sandboxing is zero.

## The second reason: safe autonomy

Giving an agent terminal access to a host with mainnet-capable keys is a bad default. A container bounds the blast radius: no host filesystem outside the workspace, no ambient credentials, and network egress you can actually reason about. That matters more here than in a typical repo because these SDKs sign blockchain transactions.

---

## Design

### Per-repo containers, not one mega-container

Five SDK repos each get a single-toolchain container. `accumulate-studio` gets a polyglot one, because it genuinely needs Node **and** Python (`dev:proxy` runs `uvicorn`; `install:proxy` runs `pip install -e .`).

Resist a single six-language image. It would be enormous, slow to pull, and would let a Rust change accidentally depend on a Dart toolchain being present.

### Pin everything

The toolchain versions the repos actually declare:

| Repo | Toolchain | Source of truth |
|---|---|---|
| Rust | stable + `rustfmt`, `clippy`, `cargo-audit`, `cargo-llvm-cov` | `unified/Makefile` targets `lint`, `fmt-check`, `audit`, `coverage-gate` |
| Python | 3.11+ | `unified/pyproject.toml` |
| Dart | `>=3.3.0 <4.0.0` | `unified/pubspec.yaml` |
| C# | .NET 9 | `src/Acme.Net.Sdk/Acme.Net.Sdk.csproj` → `<TargetFramework>net9.0</TargetFramework>` |
| JS | Node ≥18 | `apps/mcp-server/package.json` engines; JS SDK uses tsc/jest |
| Studio | Node ≥18 **+** Python 3.11 | root `package.json` scripts |

The Rust container must install the `make` targets' tooling — `cargo-audit` and the coverage tool — or `make ci-check` fails inside a container that was supposed to guarantee it works.

### `postCreateCommand` does the install

Each container runs the repo's setup on create, so the workspace is ready the moment the agent attaches:

| Repo | `postCreateCommand` |
|---|---|
| Rust | `cd unified && cargo fetch && make install-tools` |
| Python | `cd unified && pip install -e '.[dev]'` |
| Dart | `cd unified && dart pub get` |
| C# | `dotnet restore Acme.Net.Sdk.sln` |
| JS | `cd javascript && npm ci && npm run build` |
| Studio | `npm ci && npm run build:types && npm run install:proxy` |

Studio's ordering is load-bearing: `packages/types` must build before dependents. The Vercel deploy notes in memory record that build ordering has bitten before — encode it here so it cannot bite an agent.

### Network policy

Containers need network for package installs and for Kermit testnet. They do **not** need mainnet.

Set `ACCUMULATE_NETWORK=kermit` (or `testnet`) in `containerEnv` for every container. The MCP server already honors this (`index.ts:291-298`) and falls back to testnet on an unknown value. Combined with RB-04's rule that mainnet requires `ACCUMULATE_ALLOW_MAINNET=1`, the container default is safe.

Do **not** bake keys or faucet credentials into images. Mount them at attach time or provision per-session (RB-01's provisioner).

### What goes in the image vs. the features

Prefer official devcontainer features (`ghcr.io/devcontainers/features/rust`, `.../dotnet`, `.../python`, `.../node`) over hand-rolled Dockerfiles. Fewer lines to maintain, and version pinning is a single field. Reach for a Dockerfile only where a feature does not exist — Dart is the likely case.

---

## Steps

1. **Studio first.** It is the most complex and the one where setup failure is most likely. `.devcontainer/devcontainer.json` with Node 20 + Python 3.11 features, the `postCreateCommand` above, `containerEnv` with `ACCUMULATE_NETWORK=kermit`, and forwarded ports for Vite (5173) and the proxy (8000).

2. **Verify by destruction.** Clone into a fresh container and run the full `AGENTS.md` command set: `npm ci`, `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run validate:manifests`, `npm run harness:selftest`. Every one must pass with zero host dependencies. Anything that fails is either a container bug or an `AGENTS.md` bug — fix both.

3. **Then the four single-toolchain SDKs**, same pattern.

4. **Rust last** — it has the most tooling (`make install-tools`, `cargo-audit`, coverage) and will take the longest to get `make ci-check` green inside the container.

5. **Add a VS Code extensions list** to each `devcontainer.json` — `rust-analyzer`, `Dart-Code.dart-code`, `ms-python.python` + `charliermarsh.ruff`, `ms-dotnettools.csdevkit`. These are the LSP servers. This is the concrete overlap between this runbook and the code-intelligence pillar: the container is how an agent gets a working language server without provisioning one.

6. **Cross-reference from `AGENTS.md`.** Each manifest's Setup section should lead with "open in the devcontainer" and give the manual path as the fallback.

7. **CI parity.** Use the same base images in CI as in the devcontainer. If CI and the container diverge, "works in the container" stops meaning "will pass CI" — which is the whole point.

---

## Acceptance criteria

- [ ] All 6 repos have `.devcontainer/devcontainer.json`
- [ ] Every toolchain version is pinned and matches what the repo declares
- [ ] From a fresh container with no host toolchain, every command in that repo's `AGENTS.md` succeeds
- [ ] Rust container runs `make ci-check` green
- [ ] Studio container runs Vite and the proxy concurrently (`npm run dev:all`)
- [ ] `ACCUMULATE_NETWORK` defaults to testnet in every container
- [ ] No image contains keys, tokens, or faucet credentials
- [ ] LSP extensions declared per container
- [ ] CI uses the same base images
- [ ] Container build time is documented; if a cold build exceeds ~5 minutes, prebuild and publish the image

## Risks

**Rot.** A devcontainer that no longer builds is worse than none — it fails after the agent has already committed to it. Build all six on a schedule in CI.

**Windows host friction.** Development here is on Windows 11. Devcontainers run under WSL2/Docker Desktop; line endings and path handling will differ from the host. Set `.gitattributes` deliberately and test at least one container end-to-end from the Windows host before declaring done.

**False confidence.** A container guarantees the toolchain, not the network. Testnet flakiness will still fail integration suites. `AGENTS.md` must mark which suites need network (RB-03 acceptance criterion) so an agent does not misread a faucet outage as a broken change.

**Scope.** eBPF/syscall-level guardrails are out of scope. Container isolation plus testnet-by-default plus opt-in signing covers the realistic risk for this project. Revisit only if agents are given mainnet keys.

## Rollback

Deleting `.devcontainer/` restores host-based development exactly. No repo code depends on the container.
