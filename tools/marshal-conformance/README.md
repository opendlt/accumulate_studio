# marshal-conformance

Every SDK must marshal a transaction body to the **same bytes**, because those
bytes are the signing preimage. If two SDKs disagree, one of them signs a
preimage the network does not recognise and the node reports only
`"transaction is not signed"` — an error that points nowhere near the cause.

`corpus.json` holds one body per transaction type. `golden.json` holds the
expected hex, and is the shape all five SDKs must reproduce.

## Defects this found

- **C# `issueTokens` marshalled to `0109`** — just the type byte. It implemented
  an obsolete single-recipient shape (`{2: recipient, 3: amount}`) while the
  protocol uses a repeated `to` list at tag 4, so the recipients vanished from
  the preimage entirely.
- **C# key-page opcodes** had `Update` and `Remove` swapped, in both the enum and
  the marshaller.
- **`authorities` field numbers** were wrong or missing across four SDKs:
  `createTokenAccount` was 5 in C# and 4 in Dart (protocol says 7),
  `createToken` was 8 in Dart (protocol says 9), `createKeyBook` was absent in
  C#, and Python and Rust omitted the field everywhere despite documenting it.

Each was invisible in normal use until a transaction was rejected as unsigned.

## Run

Generate each SDK's output, then diff against `golden.json`:

```bash
# python (the reference implementation)
python -c "from accumulate_client.convenience import _encode_tx_body as E; ..."

# rust
cargo run --example conform -- corpus.json rust.json

# dart
dart run bin/conform.dart corpus.json dart.json

# csharp
dotnet run --project tools/csmarshal -- corpus.json csharp.json
```

JavaScript is not in the corpus: it encodes through decorators generated
directly from the protocol definition, so its field numbers are correct by
construction — and those decorators are what the other four were checked
against.

## Adding a transaction type

Add a body to `corpus.json`, regenerate `golden.json` from the Python reference,
and confirm the other three agree before committing. A new type that only one
SDK can marshal is exactly the defect this exists to catch.
