# opendlt-c-sharp-v2v3-sdk — repository guide for agents

The C# SDK for the Accumulate blockchain. Published as `Acme.Net.Sdk` (v2.3.1).

> Building **on** Accumulate rather than **on this SDK**? You want `llms.txt` (quickstart + rules) and `llms-full.txt` (full API). This file is about working on the SDK itself.

## Setup

Toolchain: **.NET 9 SDK**

```bash
dotnet restore Acme.Net.Sdk.sln
```

## Build

```bash
dotnet build Acme.Net.Sdk.sln -c Release
```

## Test

| Command | Covers | Needs network |
|---|---|:--:|
| `dotnet test test/Acme.Net.Sdk.Tests` | unit suite | no |
| `dotnet test test/Acme.Net.Sdk.AccountTests` | account suite | **yes** |

Network-dependent suites talk to a live testnet. If they fail while the unit suite passes, suspect the network before suspecting your change.

## Lint & format

```bash
dotnet format --verify-no-changes
```

## Layout

```
src/Acme.Net.Sdk/               the library
test/Acme.Net.Sdk.Tests/        unit tests
test/Acme.Net.Sdk.AccountTests/ network-dependent tests
test/Acme.Net.Sdk.Benchmarks/   benchmarks
examples/v3/                    runnable examples
```

## Gotchas

- `<GenerateDocumentationFile>true</GenerateDocumentationFile>` must stay on — the nupkg has to ship `lib/<tfm>/*.xml` or IntelliSense and agent tooling lose every signature.
- `AcmeClient` is `[Obsolete]`. Use `Accumulate` / `TxBody` / `SmartSigner`.
- Transaction type codes were wrong for 5 variants historically; `TransactionCodec` was also missing `MarshalUpdateKey` and `MarshalTransferCredits`. Treat marshaling changes as consensus-visible.
- Url objects (`Lid`, `Lta`) need `.String()`; stored URL strings do not. Calling `.String()` on a string is a compile error.

## Permitted commands

Safe to run unattended: build, test, lint, format, and any read-only query against a **testnet**.

Require a human first:

- publishing or releasing (registry writes are irreversible)
- anything targeting **mainnet**
- rewriting git history, force-pushing, or changing CI credentials
- changing transaction marshaling or signing bytes — consensus-visible

## Before you commit

```bash
dotnet build && dotnet test test/Acme.Net.Sdk.Tests
```
