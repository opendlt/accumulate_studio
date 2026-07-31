/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/generate-mcp-content.mjs from:
 *   packages/codegen/src/manifests/*.sdk-manifest.json
 *   apps/studio/src/data/flow-templates.ts
 *
 * Regenerate with: npm run gen:mcp
 */

export interface ConceptDoc {
  id: string;
  title: string;
  body: string;
}

export interface OperationCatalog {
  language: string;
  display: string;
  package: string;
  install: string;
  sdkVersion: string;
  entrypoints: unknown[];
  operations: Array<{
    op: string;
    category: string;
    symbols: unknown[];
    inputs: unknown[];
    outputs: unknown[];
    requires: string[];
  }>;
}

export interface GoldenPathTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedTime: string;
  tags: string[];
  instructions: string[];
  prerequisites: string[];
}

export const SDK_LANGUAGES = [
  "python",
  "rust",
  "dart",
  "csharp",
  "javascript"
] as const;

export const CONCEPTS: Record<string, ConceptDoc> = {
  "amount-scaling": {
    "id": "amount-scaling",
    "title": "Amount scaling (the 1e8 rule)",
    "body": "# Amount scaling\n\n**1 ACME = 100,000,000 (1e8) base units.** Every amount field in every Accumulate\ntransaction is denominated in base units. Passing whole ACME is the single most\ncommon integration bug.\n\n| You mean | You must pass |\n|---|---|\n| 1 ACME | `100000000` |\n| 5 ACME | `500000000` |\n| 0.5 ACME | `50000000` |\n\nEach SDK ships an `Amount` helper — use it rather than writing the multiplication\nby hand:\n\n- Python: `Amount.acme(5)`\n- Rust: `Amount::acme(5)`\n- Dart: `Amount.acme(5)`\n- C#: `Amount.Acme(5)`\n- JavaScript: `Amount.acme(5)`\n\n## Credits are different\n\nCredits are NOT ACME. Buying credits converts ACME at the network oracle price,\nwhich you must query rather than assume. `Amount.credits(n, oracle)` handles the\nconversion. Credit balances are reported in hundredths of a credit."
  },
  "credits": {
    "id": "credits",
    "title": "Credits and the prerequisite chain",
    "body": "# Credits and the prerequisite chain\n\nAccumulate charges **credits**, not tokens, for transactions. An account that\nholds ACME but no credits cannot sign anything.\n\n## The chain, in order\n\n1. **Generate a key** → its lite identity and lite token account exist implicitly.\n2. **Fund the lite token account** (testnet: faucet).\n3. **Buy credits for the lite identity** — note: credits go to the lite\n   *identity*, not the lite *token account*.\n4. **Create an ADI**, signed by the lite identity. A key book and key page 1 are\n   provisioned automatically.\n5. **Buy credits for the ADI's key page** (`acc://you.acme/book/1`). Until this\n   happens the ADI cannot sign, even though it exists.\n6. Now the ADI can create accounts, send tokens, write data, and so on.\n\n## Settlement is not instant\n\nFaucet deposits and credit purchases are delivered by synthetic transactions and\ntake several seconds. Poll the account until the balance reflects, rather than\nproceeding immediately — most \"transaction is not signed\" and \"insufficient\ncredits\" errors are really \"you did not wait\".\n\n## Who signs what\n\nAfter creating an ADI, transactions on ADI-owned accounts are signed by the key\npage (`acc://you.acme/book/1`) — but *buying credits* for that page must still\nbe signed by the lite identity, because the page has no credits yet."
  },
  "adi-vs-lite": {
    "id": "adi-vs-lite",
    "title": "Lite accounts vs ADIs",
    "body": "# Lite accounts vs ADIs\n\n**Lite accounts** are derived directly from a key hash. They need no on-chain\ncreation step and are the entry point for every new user.\n\n- Lite identity: `acc://<40 hex><8 hex checksum>`\n- Lite token account: `<lite identity>/ACME`\n\nThe URL is derived as: `sha256(publicKey)` → first 20 bytes as hex → append a\n4-byte checksum computed over the **ASCII text** of that hex string.\n\n**ADIs** (Accumulate Digital Identifiers) are human-readable, hierarchical\nidentities: `acc://example.acme`. They must be created on chain and paid for,\nthey own sub-accounts (`acc://example.acme/tokens`, `/data`, `/book`), and they\nsupport key books, key pages, multi-signature, and key rotation.\n\nUse a lite account to bootstrap; use an ADI for anything real."
  },
  "key-hierarchy": {
    "id": "key-hierarchy",
    "title": "Key books, key pages, and authorities",
    "body": "# Key books, key pages, and authorities\n\n- **Key book** (`acc://you.acme/book`) — the authority set for an ADI.\n- **Key page** (`acc://you.acme/book/1`) — an ordered set of keys plus a\n  signature threshold. Pages hold credits and are what actually sign.\n- **Threshold** — how many distinct keys on the page must sign. Threshold 2 with\n  2 keys is a 2-of-2 multisig.\n\n## The rule that surprises people\n\nAccumulate requires **all** authorities on an account to approve a transaction.\nWhen updating a key page that has its own book (e.g. `multisig-book/1`), sign\nwith **that page's own book**, not the ADI's default `book`. Signing with the\npage's own book satisfies both the ADI authority and the page's own authority.\n\n## Key rotation is ONE atomic transaction\n\nUse **`updateKey`** (`TxBody.update_key(new_key_hash)`). It replaces the signing\nkey in a single transaction, **signed by the key being replaced**:\n\n```\nbody = TxBody.update_key(sha256(new_public_key))\nsign with the OLD key, signer = the key page\n```\n\nDo **not** rotate with add-key-then-remove-key. That is two `updateKeyPage`\ntransactions, two settles, and a window where the page holds both keys — and if\nthe page threshold is above 1, each of those transactions itself needs multiple\nsignatures. `updateKey` avoids all of it.\n\nKeys are stored as `sha256(publicKey)` hashes, not raw public keys — compare\nhashes when verifying a rotation took effect.\n\n## Satisfying a threshold (M-of-N)\n\nA threshold above 1 needs **distinct keys signing the SAME transaction**. Signing\nthe same body twice does not work: the first signature's metadata becomes the\ntransaction's `initiator` and is baked into the header, so a second independent\nsignature produces a *different transaction hash* and neither reaches threshold.\n\nCo-sign the existing envelope instead:\n\n```\naccumulate tx build <op> --param ... --out body.json\naccumulate tx sign --body body.json --principal <acct> --signer <page> --key-env K1 --out env1.json\naccumulate tx sign --envelope env1.json --signer <page> --key-env K2 --out env2.json   # co-sign\naccumulate tx submit --envelope env2.json\n```\n\nIn the SDKs this is `SmartSigner.sign_existing` / `signExisting` /\n`SignExistingAsync`. Collect all signatures BEFORE submitting: once a signature\nis on chain, resubmitting it trips replay protection\n(`invalid timestamp: have … got …`)."
  },
  "networks": {
    "id": "networks",
    "title": "Networks and safety defaults",
    "body": "# Networks\n\n| Network | Purpose | Faucet |\n|---|---|---|\n| `kermit` | Primary test network used by all examples | yes |\n| `testnet` | Public test network | yes |\n| `devnet` | Development network | yes |\n| `mainnet` | Production — **real value** | no |\n| `local` | Local node on :26660 | yes |\n\n**Default to Kermit.** This MCP server defaults to testnet and never selects\nmainnet implicitly. Mainnet is read-only in Studio.\n\nDevelop and test against Kermit, fund from the faucet, and only move to mainnet\ndeliberately."
  }
};

export const OPERATION_CATALOGS: Record<string, OperationCatalog> = {
  "python": {
    "language": "python",
    "display": "Python",
    "package": "accumulate-sdk-opendlt",
    "install": "pip install accumulate-sdk-opendlt",
    "sdkVersion": "2.3.0",
    "entrypoints": [
      {
        "symbol": "Accumulate",
        "path": "accumulate_client",
        "kind": "class",
        "doc": "Main client facade with factory methods for network connection"
      },
      {
        "symbol": "TxBody",
        "path": "accumulate_client.convenience",
        "kind": "class",
        "doc": "Static methods that build transaction body objects"
      },
      {
        "symbol": "SmartSigner",
        "path": "accumulate_client.convenience",
        "kind": "class",
        "doc": "Signs, submits, and waits for transaction results"
      },
      {
        "symbol": "Ed25519KeyPair",
        "path": "accumulate_client.crypto.ed25519",
        "kind": "class",
        "doc": "Ed25519 key pair generation and derivation"
      }
    ],
    "operations": [
      {
        "op": "generate_keys",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.generate",
            "path": "accumulate_client.crypto.ed25519",
            "signature": "() -> Ed25519KeyPair"
          },
          {
            "symbol": "Ed25519KeyPair.derive_lite_identity_url",
            "path": "accumulate_client.crypto.ed25519",
            "signature": "(self) -> str"
          },
          {
            "symbol": "Ed25519KeyPair.derive_lite_token_account_url",
            "path": "accumulate_client.crypto.ed25519",
            "signature": "(self, token: str) -> str"
          },
          {
            "symbol": "Ed25519KeyPair.public_key_bytes",
            "path": "accumulate_client.crypto.ed25519",
            "signature": "(self) -> bytes"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "keypair",
            "type": "Ed25519KeyPair"
          },
          {
            "name": "liteIdentity",
            "type": "str"
          },
          {
            "name": "liteTokenAccount",
            "type": "str"
          },
          {
            "name": "publicKeyHash",
            "type": "str"
          }
        ],
        "requires": []
      },
      {
        "op": "faucet",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.faucet",
            "path": "accumulate_client",
            "signature": "(self, account: str) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "str",
            "required": true,
            "description": "Lite token account URL to fund"
          },
          {
            "name": "times",
            "type": "int",
            "required": false,
            "description": "Number of faucet calls",
            "example": 1
          }
        ],
        "outputs": [],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_balance",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "accumulate_client",
            "signature": "(self, url: str) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "str",
            "required": true,
            "description": "Account URL to poll"
          },
          {
            "name": "minBalance",
            "type": "str",
            "required": true,
            "description": "Minimum balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "str"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_credits",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "accumulate_client",
            "signature": "(self, url: str) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "str",
            "required": true,
            "description": "Key page URL to poll"
          },
          {
            "name": "minCredits",
            "type": "int",
            "required": true,
            "description": "Minimum credit balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "credits",
            "type": "int"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "add_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.add_credits",
            "path": "accumulate_client.convenience",
            "signature": "(recipient: str, amount: str, oracle: int) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "str",
            "required": true,
            "description": "Key page URL to credit"
          },
          {
            "name": "amount",
            "type": "str",
            "required": true,
            "description": "ACME amount to spend"
          },
          {
            "name": "oracle",
            "type": "int",
            "required": true,
            "description": "Oracle price (fetched at runtime)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_identity",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.create_identity",
            "path": "accumulate_client.convenience",
            "signature": "(url: str, key_book_url: str, public_key_hash: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "ADI URL"
          },
          {
            "name": "keyBookUrl",
            "type": "str",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "str",
            "required": true,
            "description": "SHA256 hash of public key"
          }
        ],
        "outputs": [
          {
            "name": "adiUrl",
            "type": "str"
          },
          {
            "name": "keyBookUrl",
            "type": "str"
          },
          {
            "name": "keyPageUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_book",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.create_key_book",
            "path": "accumulate_client.convenience",
            "signature": "(url: str, public_key_hash: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "str",
            "required": false,
            "description": "Initial key hash"
          }
        ],
        "outputs": [
          {
            "name": "keyBookUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_page",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.create_key_page",
            "path": "accumulate_client.convenience",
            "signature": "(url: str, keys: list[str]) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Key page URL"
          },
          {
            "name": "keys",
            "type": "list[str]",
            "required": true,
            "description": "Initial key hashes"
          }
        ],
        "outputs": [
          {
            "name": "keyPageUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.create_token_account",
            "path": "accumulate_client.convenience",
            "signature": "(url: str, token_url: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Token account URL"
          },
          {
            "name": "tokenUrl",
            "type": "str",
            "required": true,
            "description": "Token type URL"
          }
        ],
        "outputs": [
          {
            "name": "tokenAccountUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_data_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.create_data_account",
            "path": "accumulate_client.convenience",
            "signature": "(url: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Data account URL"
          }
        ],
        "outputs": [
          {
            "name": "dataAccountUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.create_token",
            "path": "accumulate_client.convenience",
            "signature": "(url: str, symbol: str, precision: int, supply_limit: str | None) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Token URL"
          },
          {
            "name": "symbol",
            "type": "str",
            "required": true,
            "description": "Token symbol"
          },
          {
            "name": "precision",
            "type": "int",
            "required": true,
            "description": "Decimal precision"
          },
          {
            "name": "supplyLimit",
            "type": "str",
            "required": false,
            "description": "Maximum supply"
          }
        ],
        "outputs": [
          {
            "name": "tokenUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "send_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.send_tokens_single",
            "path": "accumulate_client.convenience",
            "signature": "(to_url: str, amount: str) -> dict"
          },
          {
            "symbol": "TxBody.send_tokens",
            "path": "accumulate_client.convenience",
            "signature": "(recipients: list[tuple[str, str]]) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "recipients",
            "type": "list[tuple[str, str]]",
            "required": true,
            "description": "List of (url, amount) tuples"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "issue_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.issue_tokens",
            "path": "accumulate_client.convenience",
            "signature": "(recipient: str, amount: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "str",
            "required": true,
            "description": "Recipient token account"
          },
          {
            "name": "amount",
            "type": "str",
            "required": true,
            "description": "Amount to issue"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.burn_tokens",
            "path": "accumulate_client.convenience",
            "signature": "(amount: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "str",
            "required": true,
            "description": "Amount to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.write_data",
            "path": "accumulate_client.convenience",
            "signature": "(data: list[str]) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "entries",
            "type": "list[str]",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          },
          {
            "name": "entryHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "query_account",
        "category": "query",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "accumulate_client",
            "signature": "(self, url: str) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "str",
            "required": true,
            "description": "Account URL to query"
          }
        ],
        "outputs": [
          {
            "name": "account",
            "type": "dict"
          }
        ],
        "requires": []
      },
      {
        "op": "update_key_page",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.update_key_page",
            "path": "accumulate_client.convenience",
            "signature": "(operations: list) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "list",
            "required": true,
            "description": "Key page operations (add, remove, setThreshold)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_key",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.update_key",
            "path": "accumulate_client.convenience",
            "signature": "(new_key: str) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "newKey",
            "type": "str",
            "required": true,
            "description": "New public key hash"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_lite_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.derive_lite_token_account_url",
            "path": "accumulate_client.crypto.ed25519",
            "signature": "(self, token: str) -> str"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "liteTokenAccountUrl",
            "type": "str"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "transfer_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.transfer_credits",
            "path": "accumulate_client.convenience",
            "signature": "(recipient: str, amount: int) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "str",
            "required": true,
            "description": "Destination key page"
          },
          {
            "name": "amount",
            "type": "int",
            "required": true,
            "description": "Credits to transfer"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.burn_credits",
            "path": "accumulate_client.convenience",
            "signature": "(amount: int) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "int",
            "required": true,
            "description": "Credits to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data_to",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.write_data_to",
            "path": "accumulate_client.convenience",
            "signature": "(recipient: str, data: list[str]) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "str",
            "required": true,
            "description": "Target data account"
          },
          {
            "name": "entries",
            "type": "list[str]",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "lock_account",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.lock_account",
            "path": "accumulate_client.convenience",
            "signature": "(height: int) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "height",
            "type": "int",
            "required": true,
            "description": "Block height to lock until"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_account_auth",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.update_account_auth",
            "path": "accumulate_client.convenience",
            "signature": "(operations: list) -> dict"
          },
          {
            "symbol": "SmartSigner.sign_submit_and_wait",
            "path": "accumulate_client.convenience",
            "signature": "(self, principal: str, body: dict) -> dict"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "list",
            "required": true,
            "description": "Auth operations (enable, disable, add, remove)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "co_sign",
        "category": "authority",
        "symbols": [
          {
            "symbol": "SmartSigner.sign_and_build",
            "path": "accumulate_client.convenience",
            "signature": "build a signed envelope WITHOUT submitting"
          },
          {
            "symbol": "SmartSigner.sign_existing",
            "path": "accumulate_client.convenience",
            "signature": "(self, envelope: dict) -> dict"
          },
          {
            "symbol": "Accumulate.submit",
            "path": "accumulate_client.convenience",
            "signature": "submit the fully-signed envelope"
          }
        ],
        "inputs": [
          {
            "name": "operation",
            "type": "str",
            "required": true,
            "description": "Transaction to run under the threshold, e.g. create_data_account"
          },
          {
            "name": "additionalSigners",
            "type": "list",
            "required": true,
            "description": "Distinct keys that must ALSO sign the SAME transaction"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      }
    ]
  },
  "rust": {
    "language": "rust",
    "display": "Rust",
    "package": "accumulate-sdk",
    "install": "cargo add accumulate-sdk",
    "sdkVersion": "2.3.2",
    "entrypoints": [
      {
        "symbol": "AccumulateClient",
        "path": "accumulate_client",
        "kind": "class",
        "doc": "Main client with async factory methods for network connection"
      },
      {
        "symbol": "TxBody",
        "path": "accumulate_client",
        "kind": "class",
        "doc": "Static methods that build transaction body structs"
      },
      {
        "symbol": "SmartSigner",
        "path": "accumulate_client",
        "kind": "class",
        "doc": "Signs, submits, and waits for transaction results"
      },
      {
        "symbol": "Ed25519Signer",
        "path": "accumulate_client::crypto::ed25519",
        "kind": "class",
        "doc": "Ed25519 key pair generation"
      },
      {
        "symbol": "AccOptions",
        "path": "accumulate_client",
        "kind": "class",
        "doc": "Connection options"
      }
    ],
    "operations": [
      {
        "op": "generate_keys",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Ed25519Signer::generate",
            "path": "accumulate_client::crypto::ed25519",
            "signature": "() -> Ed25519Signer"
          },
          {
            "symbol": "derive_lite_identity_url",
            "path": "accumulate_client::crypto::ed25519",
            "signature": "(pub_key: &[u8]) -> String"
          },
          {
            "symbol": "derive_lite_token_account_url",
            "path": "accumulate_client::crypto::ed25519",
            "signature": "(pub_key: &[u8]) -> String"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "signer",
            "type": "Ed25519Signer"
          },
          {
            "name": "liteIdentity",
            "type": "String"
          },
          {
            "name": "liteTokenAccount",
            "type": "String"
          },
          {
            "name": "publicKey",
            "type": "Vec<u8>"
          }
        ],
        "requires": []
      },
      {
        "op": "faucet",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateClient::faucet",
            "path": "accumulate_client",
            "signature": "(&self, account: &str) -> Result<()>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "&str",
            "required": true,
            "description": "Account URL to fund"
          },
          {
            "name": "times",
            "type": "u32",
            "required": false,
            "description": "Number of faucet calls"
          }
        ],
        "outputs": [],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_balance",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateClient::query",
            "path": "accumulate_client",
            "signature": "(&self, url: &str) -> Result<Value>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "&str",
            "required": true
          },
          {
            "name": "minBalance",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "u64"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_credits",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateClient::query",
            "path": "accumulate_client",
            "signature": "(&self, url: &str) -> Result<Value>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "&str",
            "required": true
          },
          {
            "name": "minCredits",
            "type": "u64",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "credits",
            "type": "u64"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "add_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody::add_credits",
            "path": "accumulate_client",
            "signature": "(recipient: &str, amount: &str, oracle: u64) -> TxBody"
          },
          {
            "symbol": "SmartSigner::sign_submit_and_wait",
            "path": "accumulate_client",
            "signature": "(&mut self, principal: &str, body: &TxBody, memo: Option<&str>, timeout: u64) -> Result<Value>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "&str",
            "required": true
          },
          {
            "name": "amount",
            "type": "&str",
            "required": true
          },
          {
            "name": "oracle",
            "type": "u64",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_identity",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody::create_identity",
            "path": "accumulate_client",
            "signature": "(url: &str, key_book_url: &str, pub_key: &[u8]) -> TxBody"
          },
          {
            "symbol": "SmartSigner::sign_submit_and_wait",
            "path": "accumulate_client",
            "signature": "(&mut self, principal: &str, body: &TxBody, memo: Option<&str>, timeout: u64) -> Result<Value>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          },
          {
            "name": "keyBookUrl",
            "type": "&str",
            "required": true
          },
          {
            "name": "publicKey",
            "type": "&[u8]",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "adiUrl",
            "type": "String"
          },
          {
            "name": "keyBookUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_book",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody::create_key_book",
            "path": "accumulate_client",
            "signature": "(url: &str, pub_key_hash: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          },
          {
            "name": "publicKeyHash",
            "type": "&str",
            "required": false
          }
        ],
        "outputs": [
          {
            "name": "keyBookUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_page",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody::create_key_page",
            "path": "accumulate_client",
            "signature": "(url: &str, keys: &[&str]) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          },
          {
            "name": "keys",
            "type": "Vec<String>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "keyPageUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody::create_token_account",
            "path": "accumulate_client",
            "signature": "(url: &str, token_url: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          },
          {
            "name": "tokenUrl",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "tokenAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_data_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody::create_data_account",
            "path": "accumulate_client",
            "signature": "(url: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "dataAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody::create_token",
            "path": "accumulate_client",
            "signature": "(url: &str, symbol: &str, precision: u8, supply_limit: Option<&str>) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          },
          {
            "name": "symbol",
            "type": "&str",
            "required": true
          },
          {
            "name": "precision",
            "type": "u8",
            "required": true
          },
          {
            "name": "supplyLimit",
            "type": "Option<&str>",
            "required": false
          }
        ],
        "outputs": [
          {
            "name": "tokenUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "send_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody::send_tokens_single",
            "path": "accumulate_client",
            "signature": "(to_url: &str, amount: &str) -> TxBody"
          },
          {
            "symbol": "TxBody::send_tokens_multi",
            "path": "accumulate_client",
            "signature": "(recipients: &[(&str, &str)]) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "recipients",
            "type": "Vec<(String, String)>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "issue_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody::issue_tokens",
            "path": "accumulate_client",
            "signature": "(recipient: &str, amount: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "&str",
            "required": true
          },
          {
            "name": "amount",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody::burn_tokens",
            "path": "accumulate_client",
            "signature": "(amount: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody::write_data",
            "path": "accumulate_client",
            "signature": "(entries: &[Vec<u8>]) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "entries",
            "type": "Vec<Vec<u8>>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "query_account",
        "category": "query",
        "symbols": [
          {
            "symbol": "AccumulateClient::query",
            "path": "accumulate_client",
            "signature": "(&self, url: &str) -> Result<Value>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "account",
            "type": "Value"
          }
        ],
        "requires": []
      },
      {
        "op": "update_key_page",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody::update_key_page_add_key",
            "path": "accumulate_client",
            "signature": "(key: &str) -> TxBody"
          },
          {
            "symbol": "TxBody::update_key_page_remove_key",
            "path": "accumulate_client",
            "signature": "(key: &str) -> TxBody"
          },
          {
            "symbol": "TxBody::update_key_page_set_threshold",
            "path": "accumulate_client",
            "signature": "(threshold: u64) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "Vec<KeyPageOp>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_key",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody::update_key",
            "path": "accumulate_client",
            "signature": "(new_key: &str) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "newKey",
            "type": "&str",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_lite_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "derive_lite_token_account_url",
            "path": "accumulate_client::crypto::ed25519",
            "signature": "(pub_key: &[u8]) -> String"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "liteTokenAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "transfer_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody::transfer_credits",
            "path": "accumulate_client",
            "signature": "(recipient: &str, amount: u64) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "&str",
            "required": true
          },
          {
            "name": "amount",
            "type": "u64",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody::burn_credits",
            "path": "accumulate_client",
            "signature": "(amount: u64) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "u64",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data_to",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody::write_data_to",
            "path": "accumulate_client",
            "signature": "(recipient: &str, entries: &[Vec<u8>]) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "&str",
            "required": true
          },
          {
            "name": "entries",
            "type": "Vec<Vec<u8>>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "lock_account",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody::lock_account",
            "path": "accumulate_client",
            "signature": "(height: u64) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "height",
            "type": "u64",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_account_auth",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody::update_account_auth",
            "path": "accumulate_client",
            "signature": "(operations: &[AuthOp]) -> TxBody"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "Vec<AuthOp>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "co_sign",
        "category": "authority",
        "symbols": [
          {
            "symbol": "SmartSigner::sign",
            "path": "accumulate_client::helpers",
            "signature": "build a signed envelope WITHOUT submitting"
          },
          {
            "symbol": "SmartSigner::sign_existing",
            "path": "accumulate_client::helpers",
            "signature": "(&self, envelope: &Value) -> Result<Value>"
          },
          {
            "symbol": "AccumulateClient::v3 submit",
            "path": "accumulate_client::helpers",
            "signature": "submit the fully-signed envelope"
          }
        ],
        "inputs": [
          {
            "name": "operation",
            "type": "str",
            "required": true,
            "description": "Transaction to run under the threshold, e.g. create_data_account"
          },
          {
            "name": "additionalSigners",
            "type": "list",
            "required": true,
            "description": "Distinct keys that must ALSO sign the SAME transaction"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      }
    ]
  },
  "dart": {
    "language": "dart",
    "display": "Dart",
    "package": "opendlt_accumulate",
    "install": "dart pub add opendlt_accumulate",
    "sdkVersion": "2.3.4",
    "entrypoints": [
      {
        "symbol": "Accumulate",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Main client with factory methods for network connection"
      },
      {
        "symbol": "TxBody",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Static methods that build transaction body objects"
      },
      {
        "symbol": "SmartSigner",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Signs, submits, and waits for transaction results"
      },
      {
        "symbol": "Ed25519KeyPair",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Ed25519 key pair generation and derivation"
      },
      {
        "symbol": "UnifiedKeyPair",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Wrapper for different key pair types"
      },
      {
        "symbol": "NetworkEndpoint",
        "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
        "kind": "class",
        "doc": "Network endpoint enumeration"
      }
    ],
    "operations": [
      {
        "op": "generate_keys",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.generate",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Future<Ed25519KeyPair> generate()"
          },
          {
            "symbol": "Ed25519KeyPair.deriveLiteIdentityUrl",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<String> deriveLiteIdentityUrl()"
          },
          {
            "symbol": "Ed25519KeyPair.deriveLiteTokenAccountUrl",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<String> deriveLiteTokenAccountUrl()"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "keypair",
            "type": "Ed25519KeyPair"
          },
          {
            "name": "liteIdentity",
            "type": "String"
          },
          {
            "name": "liteTokenAccount",
            "type": "String"
          }
        ],
        "requires": []
      },
      {
        "op": "faucet",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.faucet",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<void> faucet(String account)"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "String",
            "required": true
          },
          {
            "name": "times",
            "type": "int",
            "required": false
          }
        ],
        "outputs": [],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_balance",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<Map<String, dynamic>> query(String url)"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "String",
            "required": true
          },
          {
            "name": "minBalance",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "BigInt"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_credits",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<Map<String, dynamic>> query(String url)"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "String",
            "required": true
          },
          {
            "name": "minCredits",
            "type": "int",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "credits",
            "type": "int"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "add_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.addCredits",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> addCredits({required String recipient, required String amount, required dynamic oracle})"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<dynamic> signSubmitAndWait({required String principal, required Map<String, dynamic> body})"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "String",
            "required": true
          },
          {
            "name": "amount",
            "type": "String",
            "required": true
          },
          {
            "name": "oracle",
            "type": "dynamic",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_identity",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createIdentity",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createIdentity({required String url, required String keyBookUrl})"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<dynamic> signSubmitAndWait({required String principal, required Map<String, dynamic> body})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          },
          {
            "name": "keyBookUrl",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "adiUrl",
            "type": "String"
          },
          {
            "name": "keyBookUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_book",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createKeyBook",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createKeyBook({required String url, String? publicKeyHash})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          },
          {
            "name": "publicKeyHash",
            "type": "String",
            "required": false
          }
        ],
        "outputs": [
          {
            "name": "keyBookUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_page",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createKeyPage",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createKeyPage({required String url, required List<String> keys})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          },
          {
            "name": "keys",
            "type": "List<String>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "keyPageUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createTokenAccount",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createTokenAccount({required String url, required String tokenUrl})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          },
          {
            "name": "tokenUrl",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "tokenAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_data_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createDataAccount",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createDataAccount({required String url})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "dataAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createToken",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> createToken({required String url, required String symbol, required int precision, String? supplyLimit})"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          },
          {
            "name": "symbol",
            "type": "String",
            "required": true
          },
          {
            "name": "precision",
            "type": "int",
            "required": true
          },
          {
            "name": "supplyLimit",
            "type": "String",
            "required": false
          }
        ],
        "outputs": [
          {
            "name": "tokenUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "send_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.sendTokensSingle",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> sendTokensSingle({required String toUrl, required String amount})"
          },
          {
            "symbol": "TxBody.sendTokens",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> sendTokens({required List<TokenRecipient> recipients})"
          }
        ],
        "inputs": [
          {
            "name": "recipients",
            "type": "List<TokenRecipient>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "issue_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.issueTokens",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> issueTokens({required String recipient, required String amount})"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "String",
            "required": true
          },
          {
            "name": "amount",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.burnTokens",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> burnTokens({required String amount})"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.writeData",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> writeData({required List<String> entriesHex})"
          }
        ],
        "inputs": [
          {
            "name": "entries",
            "type": "List<String>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "query_account",
        "category": "query",
        "symbols": [
          {
            "symbol": "Accumulate.v3.query",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<Map<String, dynamic>> query(String url)"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "account",
            "type": "Map<String, dynamic>"
          }
        ],
        "requires": []
      },
      {
        "op": "update_key_page",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateKeyPage",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> updateKeyPage({required List<Map<String, dynamic>> operations})"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "List<Map<String, dynamic>>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_key",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateKey",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> updateKey({required String newKey})"
          }
        ],
        "inputs": [
          {
            "name": "newKey",
            "type": "String",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_lite_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.deriveLiteTokenAccountUrl",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "Future<String> deriveLiteTokenAccountUrl()"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "liteTokenAccountUrl",
            "type": "String"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "transfer_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.transferCredits",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> transferCredits({required String recipient, required int amount})"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "String",
            "required": true
          },
          {
            "name": "amount",
            "type": "int",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.burnCredits",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> burnCredits({required int amount})"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "int",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data_to",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.writeDataTo",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> writeDataTo({required String recipient, required List<String> entriesHex})"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "String",
            "required": true
          },
          {
            "name": "entries",
            "type": "List<String>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "lock_account",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.lockAccount",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> lockAccount({required int height})"
          }
        ],
        "inputs": [
          {
            "name": "height",
            "type": "int",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_account_auth",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateAccountAuth",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "static Map<String, dynamic> updateAccountAuth({required List<Map<String, dynamic>> operations})"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "List<Map<String, dynamic>>",
            "required": true
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "String"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "co_sign",
        "category": "authority",
        "symbols": [
          {
            "symbol": "SmartSigner.sign",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "build a signed envelope WITHOUT submitting"
          },
          {
            "symbol": "SmartSigner.signExisting",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "(Envelope envelope) -> Future<Envelope>"
          },
          {
            "symbol": "AccumulateV3.submit",
            "path": "package:opendlt_accumulate/opendlt_accumulate.dart",
            "signature": "submit the fully-signed envelope"
          }
        ],
        "inputs": [
          {
            "name": "operation",
            "type": "str",
            "required": true,
            "description": "Transaction to run under the threshold, e.g. create_data_account"
          },
          {
            "name": "additionalSigners",
            "type": "list",
            "required": true,
            "description": "Distinct keys that must ALSO sign the SAME transaction"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      }
    ]
  },
  "csharp": {
    "language": "csharp",
    "display": "C#",
    "package": "Acme.Net.Sdk",
    "install": "dotnet add package Acme.Net.Sdk",
    "sdkVersion": "2.3.2",
    "entrypoints": [
      {
        "symbol": "Accumulate",
        "path": "Acme.Net.Sdk",
        "kind": "class",
        "doc": "Main client facade with factory methods for network connection"
      },
      {
        "symbol": "TxBody",
        "path": "Acme.Net.Sdk.Transactions",
        "kind": "class",
        "doc": "Static methods that build transaction body objects"
      },
      {
        "symbol": "SmartSigner",
        "path": "Acme.Net.Sdk.Signing",
        "kind": "class",
        "doc": "Signs, submits, and waits for transaction results"
      },
      {
        "symbol": "AccKeyPairGenerator",
        "path": "Acme.Net.Sdk.Signing",
        "kind": "class",
        "doc": "Ed25519 key pair generation"
      },
      {
        "symbol": "Principal",
        "path": "Acme.Net.Sdk.Protocol",
        "kind": "class",
        "doc": "Lite URL derivation from public keys"
      },
      {
        "symbol": "AccumulateHelper",
        "path": "Acme.Net.Sdk.Helpers",
        "kind": "class",
        "doc": "Polling, oracle, faucet helper utilities"
      }
    ],
    "operations": [
      {
        "op": "generate_keys",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccKeyPairGenerator.GenerateSignatureKeyPair",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(SignatureType) -> AccKeyPair"
          },
          {
            "symbol": "Principal.ComputeUrl",
            "path": "Acme.Net.Sdk.Protocol",
            "signature": "(byte[]) -> Url"
          },
          {
            "symbol": "Principal.ComputeUrl",
            "path": "Acme.Net.Sdk.Protocol",
            "signature": "(byte[], Url) -> Url"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "keypair",
            "type": "AccKeyPair"
          },
          {
            "name": "liteIdentity",
            "type": "Url"
          },
          {
            "name": "liteTokenAccount",
            "type": "Url"
          },
          {
            "name": "publicKeyHash",
            "type": "string"
          }
        ],
        "requires": []
      },
      {
        "op": "faucet",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateHelper.FaucetAsync",
            "path": "Acme.Net.Sdk.Helpers",
            "signature": "(string, int) -> Task"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Lite token account URL to fund"
          },
          {
            "name": "times",
            "type": "int",
            "required": false,
            "description": "Number of faucet calls",
            "example": 1
          }
        ],
        "outputs": [],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_balance",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateHelper.PollForBalanceAsync",
            "path": "Acme.Net.Sdk.Helpers",
            "signature": "(string) -> Task<ulong>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Account URL to poll"
          },
          {
            "name": "minBalance",
            "type": "string",
            "required": true,
            "description": "Minimum balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "ulong"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_credits",
        "category": "utility",
        "symbols": [
          {
            "symbol": "AccumulateHelper.PollForCreditsAsync",
            "path": "Acme.Net.Sdk.Helpers",
            "signature": "(string) -> Task<ulong>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Key page URL to poll"
          },
          {
            "name": "minCredits",
            "type": "int",
            "required": true,
            "description": "Minimum credit balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "credits",
            "type": "ulong"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "add_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.AddCredits",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string, ulong) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Key page URL to credit"
          },
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "ACME amount to spend"
          },
          {
            "name": "oracle",
            "type": "ulong",
            "required": true,
            "description": "Oracle price (fetched at runtime)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_identity",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.CreateIdentity",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string, string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "ADI URL"
          },
          {
            "name": "keyBookUrl",
            "type": "string",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "string",
            "required": true,
            "description": "SHA256 hash of public key"
          }
        ],
        "outputs": [
          {
            "name": "adiUrl",
            "type": "string"
          },
          {
            "name": "keyBookUrl",
            "type": "string"
          },
          {
            "name": "keyPageUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_book",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.CreateKeyBook",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "string",
            "required": false,
            "description": "Initial key hash"
          }
        ],
        "outputs": [
          {
            "name": "keyBookUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_page",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.CreateKeyPage",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, List<string>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Key page URL"
          },
          {
            "name": "keys",
            "type": "List<string>",
            "required": true,
            "description": "Initial key hashes"
          }
        ],
        "outputs": [
          {
            "name": "keyPageUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.CreateTokenAccount",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Token account URL"
          },
          {
            "name": "tokenUrl",
            "type": "string",
            "required": true,
            "description": "Token type URL"
          }
        ],
        "outputs": [
          {
            "name": "tokenAccountUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_data_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.CreateDataAccount",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Data account URL"
          }
        ],
        "outputs": [
          {
            "name": "dataAccountUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.CreateToken",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string, int) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Token URL"
          },
          {
            "name": "symbol",
            "type": "string",
            "required": true,
            "description": "Token symbol"
          },
          {
            "name": "precision",
            "type": "int",
            "required": true,
            "description": "Decimal precision"
          }
        ],
        "outputs": [
          {
            "name": "tokenUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "send_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.SendTokensSingle",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string) -> object"
          },
          {
            "symbol": "TxBody.SendTokens",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(List<TxRecipient>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipients",
            "type": "List<TxRecipient>",
            "required": true,
            "description": "List of (url, amount) recipients"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "issue_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.IssueTokens",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Recipient token account"
          },
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "Amount to issue"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.BurnTokens",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "Amount to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.WriteData",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(List<string>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "entries",
            "type": "List<string>",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          },
          {
            "name": "entryHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "query_account",
        "category": "query",
        "symbols": [
          {
            "symbol": "Accumulate.V3.QueryAccountAsync",
            "path": "Acme.Net.Sdk",
            "signature": "(string) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Account URL to query"
          }
        ],
        "outputs": [
          {
            "name": "account",
            "type": "object"
          }
        ],
        "requires": []
      },
      {
        "op": "update_key_page",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.UpdateKeyPage",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(List<object>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "List<object>",
            "required": true,
            "description": "Key page operations (add, remove, setThreshold)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_key",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.UpdateKey",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "newKey",
            "type": "string",
            "required": true,
            "description": "New public key hash"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_lite_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "Principal.ComputeUrl",
            "path": "Acme.Net.Sdk.Protocol",
            "signature": "(byte[], Url) -> Url"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "liteTokenAccountUrl",
            "type": "Url"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "transfer_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.TransferCredits",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, int) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Destination key page"
          },
          {
            "name": "amount",
            "type": "int",
            "required": true,
            "description": "Credits to transfer"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.BurnCredits",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(int) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "int",
            "required": true,
            "description": "Credits to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data_to",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.WriteDataTo",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(string, List<string>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Target data account"
          },
          {
            "name": "entries",
            "type": "List<string>",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "lock_account",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.LockAccount",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(int) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "height",
            "type": "int",
            "required": true,
            "description": "Block height to lock until"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_account_auth",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.UpdateAccountAuth",
            "path": "Acme.Net.Sdk.Transactions",
            "signature": "(List<object>) -> object"
          },
          {
            "symbol": "SmartSigner.SignSubmitAndWaitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(string, object) -> Task<object>"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "List<object>",
            "required": true,
            "description": "Auth operations (enable, disable, add, remove)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "co_sign",
        "category": "authority",
        "symbols": [
          {
            "symbol": "SmartSigner.SignAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "build a signed envelope WITHOUT submitting"
          },
          {
            "symbol": "SmartSigner.SignExistingAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "(Dictionary<string, object?> envelope) -> Task<Dictionary<string, object?>>"
          },
          {
            "symbol": "AccumulateV3Client.SubmitAsync",
            "path": "Acme.Net.Sdk.Signing",
            "signature": "submit the fully-signed envelope"
          }
        ],
        "inputs": [
          {
            "name": "operation",
            "type": "str",
            "required": true,
            "description": "Transaction to run under the threshold, e.g. create_data_account"
          },
          {
            "name": "additionalSigners",
            "type": "list",
            "required": true,
            "description": "Distinct keys that must ALSO sign the SAME transaction"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      }
    ]
  },
  "javascript": {
    "language": "javascript",
    "display": "JavaScript / TypeScript",
    "package": "accumulate-sdk-opendlt",
    "install": "npm install accumulate-sdk-opendlt",
    "sdkVersion": "2.3.0",
    "entrypoints": [
      {
        "symbol": "Accumulate",
        "path": "accumulate-sdk-opendlt",
        "kind": "class",
        "doc": "Main client facade with factory methods for network connection"
      },
      {
        "symbol": "TxBody",
        "path": "accumulate-sdk-opendlt",
        "kind": "class",
        "doc": "Static methods that build transaction body objects"
      },
      {
        "symbol": "SmartSigner",
        "path": "accumulate-sdk-opendlt",
        "kind": "class",
        "doc": "Signs, submits, and waits for transaction results"
      },
      {
        "symbol": "Ed25519KeyPair",
        "path": "accumulate-sdk-opendlt",
        "kind": "class",
        "doc": "Ed25519 key pair generation and derivation"
      }
    ],
    "operations": [
      {
        "op": "generate_keys",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.generate",
            "path": "accumulate-sdk-opendlt",
            "signature": "() -> Ed25519KeyPair"
          },
          {
            "symbol": "Ed25519KeyPair.deriveLiteIdentityUrl",
            "path": "accumulate-sdk-opendlt",
            "signature": "() -> string"
          },
          {
            "symbol": "Ed25519KeyPair.deriveLiteTokenAccountUrl",
            "path": "accumulate-sdk-opendlt",
            "signature": "() -> string"
          },
          {
            "symbol": "Ed25519KeyPair.publicKeyHashHex",
            "path": "accumulate-sdk-opendlt",
            "signature": "() -> string"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "keypair",
            "type": "Ed25519KeyPair"
          },
          {
            "name": "liteIdentity",
            "type": "string"
          },
          {
            "name": "liteTokenAccount",
            "type": "string"
          },
          {
            "name": "publicKeyHash",
            "type": "string"
          }
        ],
        "requires": []
      },
      {
        "op": "faucet",
        "category": "utility",
        "symbols": [
          {
            "symbol": "Accumulate.faucet",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, times: number, delay: number) -> Promise<void>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Lite token account URL to fund"
          },
          {
            "name": "times",
            "type": "number",
            "required": false,
            "description": "Number of faucet calls",
            "example": 1
          }
        ],
        "outputs": [],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_balance",
        "category": "utility",
        "symbols": [
          {
            "symbol": "pollForBalance",
            "path": "accumulate-sdk-opendlt",
            "signature": "(client: Accumulate, url: string) -> Promise<bigint>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Account URL to poll"
          },
          {
            "name": "minBalance",
            "type": "string",
            "required": true,
            "description": "Minimum balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "bigint"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "wait_for_credits",
        "category": "utility",
        "symbols": [
          {
            "symbol": "pollForCredits",
            "path": "accumulate-sdk-opendlt",
            "signature": "(client: Accumulate, url: string) -> Promise<number>"
          }
        ],
        "inputs": [
          {
            "name": "account",
            "type": "string",
            "required": true,
            "description": "Key page URL to poll"
          },
          {
            "name": "minCredits",
            "type": "number",
            "required": true,
            "description": "Minimum credit balance to wait for"
          }
        ],
        "outputs": [
          {
            "name": "credits",
            "type": "number"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "add_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.addCredits",
            "path": "accumulate-sdk-opendlt",
            "signature": "(recipient: string, amount: string, oracle: number) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Key page URL to credit"
          },
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "ACME amount to spend"
          },
          {
            "name": "oracle",
            "type": "number",
            "required": true,
            "description": "Oracle price (fetched at runtime)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_identity",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createIdentity",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, keyBookUrl: string, keyHash: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "ADI URL"
          },
          {
            "name": "keyBookUrl",
            "type": "string",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "string",
            "required": true,
            "description": "SHA256 hash of public key"
          }
        ],
        "outputs": [
          {
            "name": "adiUrl",
            "type": "string"
          },
          {
            "name": "keyBookUrl",
            "type": "string"
          },
          {
            "name": "keyPageUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_book",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createKeyBook",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, publicKeyHash: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Key book URL"
          },
          {
            "name": "publicKeyHash",
            "type": "string",
            "required": false,
            "description": "Initial key hash"
          }
        ],
        "outputs": [
          {
            "name": "keyBookUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_key_page",
        "category": "identity",
        "symbols": [
          {
            "symbol": "TxBody.createKeyPage",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, keys: string[]) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Key page URL"
          },
          {
            "name": "keys",
            "type": "string[]",
            "required": true,
            "description": "Initial key hashes"
          }
        ],
        "outputs": [
          {
            "name": "keyPageUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createTokenAccount",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, tokenUrl: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Token account URL"
          },
          {
            "name": "tokenUrl",
            "type": "string",
            "required": true,
            "description": "Token type URL"
          }
        ],
        "outputs": [
          {
            "name": "tokenAccountUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_data_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createDataAccount",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Data account URL"
          }
        ],
        "outputs": [
          {
            "name": "dataAccountUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_token",
        "category": "account",
        "symbols": [
          {
            "symbol": "TxBody.createToken",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string, symbol: string, precision: number) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Token URL"
          },
          {
            "name": "symbol",
            "type": "string",
            "required": true,
            "description": "Token symbol"
          },
          {
            "name": "precision",
            "type": "number",
            "required": true,
            "description": "Decimal precision"
          }
        ],
        "outputs": [
          {
            "name": "tokenUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "send_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.sendTokensSingle",
            "path": "accumulate-sdk-opendlt",
            "signature": "(toUrl: string, amount: string) -> object"
          },
          {
            "symbol": "TxBody.sendTokensMulti",
            "path": "accumulate-sdk-opendlt",
            "signature": "(recipients: Array<{url, amount}>) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipients",
            "type": "Array<{url: string, amount: string}>",
            "required": true,
            "description": "List of {url, amount} recipients"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "issue_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.issueTokens",
            "path": "accumulate-sdk-opendlt",
            "signature": "(recipient: string, amount: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Recipient token account"
          },
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "Amount to issue"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_tokens",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.burnTokens",
            "path": "accumulate-sdk-opendlt",
            "signature": "(amount: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "string",
            "required": true,
            "description": "Amount to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.writeData",
            "path": "accumulate-sdk-opendlt",
            "signature": "(entries: string[]) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "entries",
            "type": "string[]",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          },
          {
            "name": "entryHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "query_account",
        "category": "query",
        "symbols": [
          {
            "symbol": "Accumulate.queryAccount",
            "path": "accumulate-sdk-opendlt",
            "signature": "(url: string) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "url",
            "type": "string",
            "required": true,
            "description": "Account URL to query"
          }
        ],
        "outputs": [
          {
            "name": "account",
            "type": "object"
          }
        ],
        "requires": []
      },
      {
        "op": "update_key_page",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateKeyPage",
            "path": "accumulate-sdk-opendlt",
            "signature": "(operations: Array) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "Array",
            "required": true,
            "description": "Key page operations (add, remove, setThreshold)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_key",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateKey",
            "path": "accumulate-sdk-opendlt",
            "signature": "(newKey: string) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "newKey",
            "type": "string",
            "required": true,
            "description": "New public key hash"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "create_lite_token_account",
        "category": "account",
        "symbols": [
          {
            "symbol": "Ed25519KeyPair.deriveLiteTokenAccountUrl",
            "path": "accumulate-sdk-opendlt",
            "signature": "() -> string"
          }
        ],
        "inputs": [],
        "outputs": [
          {
            "name": "liteTokenAccountUrl",
            "type": "string"
          }
        ],
        "requires": [
          "keypair"
        ]
      },
      {
        "op": "transfer_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.transferCredits",
            "path": "accumulate-sdk-opendlt",
            "signature": "(recipient: string, amount: number) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Destination key page"
          },
          {
            "name": "amount",
            "type": "number",
            "required": true,
            "description": "Credits to transfer"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "burn_credits",
        "category": "credits",
        "symbols": [
          {
            "symbol": "TxBody.burnCredits",
            "path": "accumulate-sdk-opendlt",
            "signature": "(amount: number) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "amount",
            "type": "number",
            "required": true,
            "description": "Credits to burn"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "write_data_to",
        "category": "transaction",
        "symbols": [
          {
            "symbol": "TxBody.writeDataTo",
            "path": "accumulate-sdk-opendlt",
            "signature": "(recipient: string, entries: string[]) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "recipient",
            "type": "string",
            "required": true,
            "description": "Target data account"
          },
          {
            "name": "entries",
            "type": "string[]",
            "required": true,
            "description": "Hex-encoded data entries"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "lock_account",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.lockAccount",
            "path": "accumulate-sdk-opendlt",
            "signature": "(height: number) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "height",
            "type": "number",
            "required": true,
            "description": "Block height to lock until"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "update_account_auth",
        "category": "authority",
        "symbols": [
          {
            "symbol": "TxBody.updateAccountAuth",
            "path": "accumulate-sdk-opendlt",
            "signature": "(operations: Array) -> object"
          },
          {
            "symbol": "SmartSigner.signSubmitAndWait",
            "path": "accumulate-sdk-opendlt",
            "signature": "(principal: string, body: object) -> Promise<object>"
          }
        ],
        "inputs": [
          {
            "name": "operations",
            "type": "Array",
            "required": true,
            "description": "Auth operations (enable, disable, add, remove)"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "string"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      },
      {
        "op": "co_sign",
        "category": "authority",
        "symbols": [
          {
            "symbol": "SmartSigner.sign",
            "path": "accumulate-sdk-opendlt",
            "signature": "build a signed envelope WITHOUT submitting"
          },
          {
            "symbol": "SmartSigner.signExisting",
            "path": "accumulate-sdk-opendlt",
            "signature": "(envelope: Envelope) => Promise<Envelope>"
          },
          {
            "symbol": "Accumulate.v2.execute",
            "path": "accumulate-sdk-opendlt",
            "signature": "submit the fully-signed envelope"
          }
        ],
        "inputs": [
          {
            "name": "operation",
            "type": "str",
            "required": true,
            "description": "Transaction to run under the threshold, e.g. create_data_account"
          },
          {
            "name": "additionalSigners",
            "type": "list",
            "required": true,
            "description": "Distinct keys that must ALSO sign the SAME transaction"
          }
        ],
        "outputs": [
          {
            "name": "txHash",
            "type": "str"
          }
        ],
        "requires": [
          "keypair",
          "credits"
        ]
      }
    ]
  }
};

export const GOLDEN_PATHS: GoldenPathTemplate[] = [
  {
    "id": "lite-account-setup",
    "name": "Lite Account Setup",
    "description": "The simplest Accumulate flow. Generates a keypair, creates a lite account, and funds it via the testnet faucet. Great for understanding the basics.",
    "category": "beginner",
    "estimatedTime": "2 min",
    "tags": [
      "identity",
      "beginner",
      "getting-started"
    ],
    "instructions": [
      "Generate an Ed25519 keypair",
      "Request tokens from the testnet faucet",
      "Wait for balance to confirm"
    ],
    "prerequisites": [
      "None - great for beginners!"
    ]
  },
  {
    "id": "create-adi",
    "name": "Create Your First ADI",
    "description": "Create an Accumulate Digital Identity (ADI) from a lite account. CreateIdentity automatically provisions a key book and key page with your public key.",
    "category": "beginner",
    "estimatedTime": "3 min",
    "tags": [
      "identity",
      "beginner",
      "getting-started"
    ],
    "instructions": [
      "Generate a keypair",
      "Fund the lite account using the faucet",
      "Add credits to the lite identity",
      "Create your ADI (key book + key page are auto-provisioned)"
    ],
    "prerequisites": [
      "None - great for beginners!"
    ]
  },
  {
    "id": "zero-to-hero",
    "name": "Zero to Hero",
    "description": "Complete beginner flow from nothing to a fully functional ADI with a token account. Covers keys, faucet, credits, ADI creation, and token accounts.",
    "category": "beginner",
    "estimatedTime": "7 min",
    "tags": [
      "identity",
      "tokens",
      "beginner",
      "getting-started"
    ],
    "instructions": [
      "Generate cryptographic keys",
      "Request testnet tokens from faucet",
      "Wait for ACME tokens to arrive",
      "Add credits to lite identity",
      "Create an ADI",
      "Credit the ADI key page for signing",
      "Wait for key page credits",
      "Create a token account under the ADI"
    ],
    "prerequisites": [
      "None - great for beginners!"
    ]
  },
  {
    "id": "token-transfer",
    "name": "Send ACME Tokens",
    "description": "Complete token transfer flow from scratch. Sets up keys, creates an ADI with sender and receiver accounts, then transfers ACME between them.",
    "category": "intermediate",
    "estimatedTime": "10 min",
    "tags": [
      "tokens",
      "intermediate",
      "transfer"
    ],
    "instructions": [
      "Generate keys and fund via faucet",
      "Add credits and create an ADI",
      "Credit the ADI key page",
      "Create sender and receiver token accounts",
      "Fund the sender account from lite token account",
      "Transfer ACME from sender to receiver"
    ],
    "prerequisites": [
      "None - fully self-contained!"
    ]
  },
  {
    "id": "data-writing",
    "name": "Write Data to Chain",
    "description": "Complete data storage flow from scratch. Sets up keys, creates an ADI, then creates a data account and writes entries to it.",
    "category": "intermediate",
    "estimatedTime": "10 min",
    "tags": [
      "data",
      "intermediate",
      "storage"
    ],
    "instructions": [
      "Generate keys and fund via faucet",
      "Add credits and create an ADI",
      "Credit the ADI key page",
      "Create a data account under the ADI",
      "Write data entries to the account",
      "Query the account to verify data"
    ],
    "prerequisites": [
      "None - fully self-contained!"
    ]
  },
  {
    "id": "custom-token",
    "name": "Create Custom Token",
    "description": "Complete custom token flow from scratch. Sets up keys, creates an ADI, then creates a custom token issuer, issues tokens, and verifies the result.",
    "category": "intermediate",
    "estimatedTime": "10 min",
    "tags": [
      "tokens",
      "intermediate",
      "issuer"
    ],
    "instructions": [
      "Generate keys and fund via faucet",
      "Add credits and create an ADI",
      "Credit the ADI key page",
      "Create a custom token issuer",
      "Create a token account for the custom token",
      "Issue initial supply of tokens",
      "Verify token issuer"
    ],
    "prerequisites": [
      "None - fully self-contained!"
    ]
  },
  {
    "id": "multi-sig-setup",
    "name": "Multi-Signature Setup",
    "description": "Complete multi-sig SETUP from scratch. Sets up keys, creates an ADI, then creates a key book with 3 signers and a 2-of-3 threshold. Configuring the threshold is not the same as satisfying it — see the last step.",
    "category": "advanced",
    "estimatedTime": "15 min",
    "tags": [
      "security",
      "advanced",
      "multi-sig"
    ],
    "instructions": [
      "Generate keys and fund via faucet",
      "Add credits and create an ADI",
      "Credit the ADI key page",
      "Create a dedicated multi-sig key book",
      "Generate signer 2 keys and add to key page",
      "Generate signer 3 keys and add to key page",
      "Set the signature threshold (2 of 3)",
      "Spend under the threshold: the Co-Sign block signs with signer 1, co-signs with signer 2, then submits — all on the SAME transaction",
      "To then SPEND under that threshold, two distinct keys must sign the SAME transaction: sign once, then co-sign the resulting envelope (SmartSigner.sign_existing / signExisting / SignExistingAsync, or `accumulate tx sign --envelope`). Signing the same body twice produces two different transactions and neither reaches the threshold."
    ],
    "prerequisites": [
      "None - fully self-contained!"
    ]
  },
  {
    "id": "key-rotation",
    "name": "Key Rotation",
    "description": "Complete key rotation flow from scratch. Sets up keys, creates an ADI, then generates a new keypair and rotates the key on the key page.",
    "category": "intermediate",
    "estimatedTime": "10 min",
    "tags": [
      "security",
      "intermediate",
      "key-management"
    ],
    "instructions": [
      "Generate keys and fund via faucet",
      "Add credits and create an ADI",
      "Credit the ADI key page",
      "Generate a new keypair",
      "Rotate the key on the key page",
      "Verify the key page was updated"
    ],
    "prerequisites": [
      "None - fully self-contained!"
    ]
  }
];

export interface ErrorCatalogEntry {
  code: string;
  protocolCodes: number[];
  category: string;
  retryable: boolean;
  observed?: boolean;
  hint: string;
  messagePatterns: string[];
  causes: string[];
  remediation: string;
  relatedOps: string[];
  bindings: Record<string, string>;
}

export interface ErrorCatalog {
  version: string;
  description: string;
  categories: Record<string, string>;
  bindings: Record<string, { base: string; catch: string; codeAccess: string; import?: string }>;
  errors: ErrorCatalogEntry[];
}

export const ERROR_CATALOG: ErrorCatalog = {
  "version": "1.0",
  "description": "Canonical Accumulate error taxonomy. One catalog, five language bindings. Errors are a property of the Accumulate protocol, not of any SDK. Agents branch on `code`; `retryable` decides whether a retry is productive or a wasted turn.",
  "categories": {
    "validation": "The request is malformed or semantically invalid. Never retryable — fix the input.",
    "not_found": "The referenced account, chain, or transaction does not exist on this network.",
    "insufficient_credits": "The signing key page lacks credits. Credits pay for execution and are distinct from token balance.",
    "insufficient_balance": "The source account lacks the tokens being moved.",
    "auth": "The signature, signer, or authority set does not satisfy the principal's requirements.",
    "conflict": "The target already exists or the transaction duplicates one already recorded.",
    "pending": "Accepted but not yet final — typically awaiting additional multisig signatures.",
    "network": "Transport-level failure. Retryable.",
    "internal": "Server-side fault. Retryable with backoff."
  },
  "bindings": {
    "python": {
      "base": "AccumulateError",
      "catch": "except AccumulateError as e:",
      "codeAccess": "e.code            # ErrorCode IntEnum",
      "import": "from accumulate_client.runtime.errors import AccumulateError, ErrorCode"
    },
    "rust": {
      "base": "Error",
      "catch": "match result { Err(e) => ..., Ok(v) => ... }",
      "codeAccess": "e.code()",
      "import": "use accumulate_client::errors::Error;"
    },
    "dart": {
      "base": "AccError",
      "catch": "on AccError catch (e) {",
      "codeAccess": "e.code            // int; e.name for the mnemonic",
      "import": "import 'package:opendlt_accumulate/opendlt_accumulate.dart';"
    },
    "csharp": {
      "base": "AccumulateException",
      "catch": "catch (AccumulateException e) {",
      "codeAccess": "e.Code",
      "import": "using Acme.Net.Sdk;"
    },
    "javascript": {
      "base": "AccumulateError",
      "catch": "catch (e) { if (e instanceof AccumulateError) ... }",
      "codeAccess": "e.code",
      "import": "import { AccumulateError } from 'accumulate-sdk-opendlt';"
    }
  },
  "errors": [
    {
      "code": "ACC_ACCOUNT_NOT_FOUND",
      "protocolCodes": [
        -32807,
        -33404
      ],
      "category": "not_found",
      "retryable": false,
      "observed": true,
      "hint": "The account URL does not exist on this network.",
      "messagePatterns": [
        "accumulate error not found",
        "not found",
        "account .* not found",
        "-32807",
        "-33404"
      ],
      "causes": [
        "typo in the account URL",
        "the account was never created",
        "querying the wrong network (mainnet vs Kermit testnet)",
        "querying immediately after submit, before the transaction reached 'delivered'",
        "a MALFORMED url also surfaces as not-found on V2 rather than as a URL validation error"
      ],
      "remediation": "Verify the URL and the network. If you just created the account, wait for its creating transaction to reach 'delivered' first — use wait_for_balance / wait_for_credits rather than querying straight away.",
      "relatedOps": [
        "query_account",
        "send_tokens",
        "write_data",
        "add_credits",
        "wait_for_balance"
      ],
      "bindings": {
        "python": "AccountNotFoundError",
        "dart": "ApiError",
        "rust": "Error::NotFound",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_UNAUTHORIZED_SIGNER",
      "protocolCodes": [
        403
      ],
      "category": "auth",
      "retryable": false,
      "observed": true,
      "hint": "The signing key is not on the key page that authorizes this principal.",
      "messagePatterns": [
        "unauthorized",
        "key does not belong to signer"
      ],
      "causes": [
        "signing with the lite identity when the principal is an ADI account",
        "signing with `book/1` when the principal's own book is a different book",
        "the key was rotated out of the page by a prior update_key operation"
      ],
      "remediation": "Sign with a key that is on the principal's authorizing key page. After create_identity, ADI-owned principals are signed by `<adi>/book/1`. A key page owned by a second book (e.g. `multisig-book/1`) must be signed by that page's OWN book — Accumulate requires every authority to approve.",
      "relatedOps": [
        "update_key_page",
        "update_key",
        "update_account_auth",
        "send_tokens",
        "write_data",
        "lock_account"
      ],
      "bindings": {
        "python": "AccumulateError",
        "dart": "AuthError",
        "rust": "Error::Unauthorized",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INSUFFICIENT_CREDITS",
      "protocolCodes": [],
      "category": "insufficient_credits",
      "retryable": false,
      "observed": true,
      "hint": "The signing key page does not hold enough credits to pay for this transaction.",
      "messagePatterns": [
        "insufficientcredits",
        "insufficient credits",
        "not enough credits"
      ],
      "causes": [
        "credits were never purchased for this key page",
        "add_credits targeted the lite identity instead of the ADI key page",
        "the credit purchase has not settled yet"
      ],
      "remediation": "Call add_credits for the SIGNING key page, then wait_for_credits on that same page before retrying. Credits are separate from token balance — an account can hold ACME and still be unable to sign. Note add_credits itself must be signed by an account that already has credits (typically the funded lite identity).",
      "relatedOps": [
        "add_credits",
        "wait_for_credits",
        "create_identity",
        "create_token_account",
        "send_tokens",
        "write_data"
      ],
      "bindings": {
        "python": "InsufficientCreditsError",
        "dart": "TransactionError",
        "rust": "Error::InsufficientCredits",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_NOT_SIGNED",
      "protocolCodes": [],
      "category": "auth",
      "retryable": false,
      "observed": true,
      "hint": "The envelope reached the network without a valid signature over the transaction body.",
      "messagePatterns": [
        "is not signed",
        "transaction is not signed",
        "missing signature"
      ],
      "causes": [
        "the transaction body type has no binary marshaler, so only the type number was written",
        "the envelope was hand-rolled instead of built through SmartSigner",
        "a wrong transaction type code produced bytes the validator could not match"
      ],
      "remediation": "Build and sign through the canonical path — TxBody to construct, SmartSigner to sign and submit. Do not hand-roll envelopes. If you are working ON an SDK and see this for one specific transaction type, its marshaler is missing or its type code is wrong.",
      "relatedOps": [
        "update_key",
        "create_key_book",
        "transfer_credits",
        "send_tokens"
      ],
      "bindings": {
        "python": "MissingSignatureError",
        "dart": "SignatureError",
        "rust": "Error::InvalidSignature",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_ALREADY_EXISTS",
      "protocolCodes": [],
      "category": "conflict",
      "retryable": false,
      "observed": true,
      "hint": "The account or identity being created already exists on chain.",
      "messagePatterns": [
        "already exists",
        "duplicate"
      ],
      "causes": [
        "a re-run of a script that uses a fixed (non-unique) ADI URL",
        "the previous attempt actually succeeded and the error was misread"
      ],
      "remediation": "Query the URL first — if it exists and you own it, skip creation and continue. For repeatable scripts, derive a unique URL (e.g. a timestamp suffix) rather than a fixed name.",
      "relatedOps": [
        "create_identity",
        "create_token_account",
        "create_data_account",
        "create_token",
        "create_key_book",
        "create_key_page"
      ],
      "bindings": {
        "python": "AccumulateError",
        "dart": "TransactionError",
        "rust": "Error::Conflict",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INVALID_PRINCIPAL",
      "protocolCodes": [],
      "category": "validation",
      "retryable": false,
      "observed": true,
      "hint": "The principal URL is not a valid target for this transaction type.",
      "messagePatterns": [
        "invalid principal",
        "bad principal"
      ],
      "causes": [
        "sending tokens with the lite IDENTITY as principal instead of the lite TOKEN ACCOUNT",
        "targeting an ADI where a key page is required, or vice versa"
      ],
      "remediation": "Match the principal to the transaction type. Token transfers use the token account URL (`<lite>/ACME`), credit purchases and key operations use the identity or key page URL.",
      "relatedOps": [
        "send_tokens",
        "add_credits",
        "write_data",
        "update_key_page"
      ],
      "bindings": {
        "python": "ValidationError",
        "dart": "ValidationError",
        "rust": "Error::InvalidPrincipal",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INSUFFICIENT_BALANCE",
      "protocolCodes": [],
      "category": "insufficient_balance",
      "retryable": false,
      "observed": false,
      "hint": "The source account does not hold enough tokens for this transfer.",
      "messagePatterns": [
        "insufficient balance",
        "insufficient funds",
        "exceeds balance"
      ],
      "causes": [
        "the faucet deposit has not settled yet",
        "passing whole ACME where base units are expected, so the amount is 1e8x too large",
        "a custom token's precision is not 1e8 and the amount was scaled wrongly"
      ],
      "remediation": "Confirm the balance with wait_for_balance before transferring. Build amounts with the Amount helper — 1 ACME = 1e8 base units, and custom tokens carry their OWN precision set at creation.",
      "relatedOps": [
        "send_tokens",
        "burn_tokens",
        "issue_tokens",
        "wait_for_balance",
        "faucet"
      ],
      "bindings": {
        "python": "InsufficientBalanceError",
        "dart": "TransactionError",
        "rust": "Error::InsufficientBalance",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_TX_PENDING",
      "protocolCodes": [],
      "category": "pending",
      "retryable": true,
      "observed": true,
      "hint": "The transaction was accepted but is not final — it is awaiting additional signatures.",
      "messagePatterns": [
        "pending",
        "awaiting signatures"
      ],
      "causes": [
        "the key page threshold is greater than 1 and only one signature has been collected",
        "polling stopped before the transaction reached 'delivered'"
      ],
      "remediation": "This is not a failure. Collect the remaining signatures up to the page threshold, then poll status until delivered. Co-sign the EXISTING envelope (SmartSigner.sign_existing / signExisting / SignExistingAsync, or accumulate tx sign --envelope) — signing the same body again creates a DIFFERENT transaction that never reaches the threshold. Collect every signature before submitting: resubmitting one already on chain trips replay protection. Treating pending as success is the common multisig bug; so is treating it as a hard error.",
      "relatedOps": [
        "update_key_page",
        "send_tokens",
        "update_account_auth"
      ],
      "bindings": {
        "python": "AccumulateError",
        "dart": "TransactionError",
        "rust": "Error::Pending",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_TX_NOT_SETTLED",
      "protocolCodes": [],
      "category": "pending",
      "retryable": true,
      "observed": true,
      "hint": "The transaction was submitted and accepted, but did not reach a final state before the wait timed out.",
      "messagePatterns": [
        "did not appear on chain",
        "did not settle",
        "not delivered within",
        "timed out waiting for"
      ],
      "causes": [
        "the settle window was shorter than the network's block time",
        "the transaction produced a synthetic message that is still in flight",
        "polling stopped at the first non-final status instead of continuing"
      ],
      "remediation": "Do NOT resubmit — a resubmit risks a duplicate or an ACC_ALREADY_EXISTS. Keep polling the transaction status until 'delivered', with a longer timeout. Synthetic deposits (faucet, cross-account transfers) routinely need more time than a single block.",
      "relatedOps": [
        "wait_for_balance",
        "wait_for_credits",
        "faucet",
        "send_tokens",
        "create_identity",
        "write_data"
      ],
      "bindings": {
        "python": "AccumulateError",
        "dart": "TransactionError",
        "rust": "Error::Pending",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INVALID_URL",
      "protocolCodes": [
        1002
      ],
      "category": "validation",
      "retryable": false,
      "observed": false,
      "hint": "The string is not a well-formed Accumulate URL.",
      "messagePatterns": [
        "invalid accumulate url",
        "invalid url"
      ],
      "causes": [
        "missing the `acc://` scheme",
        "an unresolved template placeholder left in the string",
        "on the V2 API a malformed URL is reported as not-found, not as a URL error — match on the code, not the text"
      ],
      "remediation": "Accumulate URLs are `acc://<authority>[/<path>]`. Lite token accounts end in the token symbol, e.g. `acc://<keyhash>/ACME`.",
      "relatedOps": [
        "query_account",
        "send_tokens",
        "create_identity"
      ],
      "bindings": {
        "python": "ValidationError",
        "dart": "ValidationError",
        "rust": "Error::InvalidUrl",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INVALID_PARAMS",
      "protocolCodes": [
        -32802,
        -32602
      ],
      "category": "validation",
      "retryable": false,
      "observed": true,
      "hint": "The JSON-RPC parameters were rejected by the node.",
      "messagePatterns": [
        "validation error",
        "invalid params",
        "field validation for",
        "-32802",
        "-32602"
      ],
      "causes": [
        "a required field was omitted",
        "a field was sent with the wrong type (string vs number vs hex)"
      ],
      "remediation": "Check the operation's declared inputs in llms-full.txt. Hashes are 32-byte hex; amounts are base-unit integers, not decimals.",
      "relatedOps": [
        "query_account",
        "write_data"
      ],
      "bindings": {
        "python": "ValidationError",
        "dart": "ValidationError",
        "rust": "Error::InvalidParams",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_METHOD_NOT_FOUND",
      "protocolCodes": [
        -32601
      ],
      "category": "validation",
      "retryable": false,
      "observed": true,
      "hint": "The node does not expose the RPC method that was called.",
      "messagePatterns": [
        "method not found",
        "-32601"
      ],
      "causes": [
        "calling a V3 method against a V2-only endpoint, or vice versa"
      ],
      "remediation": "Use the SDK's canonical client rather than raw RPC — it targets the correct API version for the endpoint.",
      "relatedOps": [
        "query_account"
      ],
      "bindings": {
        "python": "AccumulateError",
        "dart": "ApiError",
        "rust": "Error::MethodNotFound",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_NETWORK_UNAVAILABLE",
      "protocolCodes": [],
      "category": "network",
      "retryable": true,
      "observed": true,
      "hint": "The endpoint could not be reached, or the request timed out.",
      "messagePatterns": [
        "econnrefused",
        "econnreset",
        "etimedout",
        "timeout",
        "socket hang up",
        "service unavailable",
        "connection closed",
        "connection reset"
      ],
      "causes": [
        "the testnet endpoint is briefly down",
        "a slow faucet or settle step exceeded the client timeout",
        "the response was truncated mid-stream"
      ],
      "remediation": "Retry with exponential backoff. This is the ONLY class of error where a bare retry is productive — retrying a validation or auth error just burns turns.",
      "relatedOps": [
        "faucet",
        "wait_for_balance",
        "wait_for_credits",
        "query_account"
      ],
      "bindings": {
        "python": "NetworkError",
        "dart": "NetworkError",
        "rust": "Error::Network",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_INTERNAL",
      "protocolCodes": [
        -32603
      ],
      "category": "internal",
      "retryable": true,
      "observed": false,
      "hint": "The node reported an internal error.",
      "messagePatterns": [
        "internal error",
        "-32603"
      ],
      "causes": [
        "a transient node fault"
      ],
      "remediation": "Retry once with backoff. If it persists, the request is likely malformed in a way the node did not classify — re-check the transaction body against llms-full.txt.",
      "relatedOps": [],
      "bindings": {
        "python": "AccumulateError",
        "dart": "ApiError",
        "rust": "Error::Internal",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    },
    {
      "code": "ACC_ROUTING_FAILED",
      "protocolCodes": [
        -33400
      ],
      "category": "validation",
      "retryable": false,
      "observed": true,
      "hint": "The node could not determine which partition should handle the request.",
      "messagePatterns": [
        "cannot route request",
        "nothing to route",
        "-33400"
      ],
      "causes": [
        "the envelope carries no transaction, or a transaction with no principal",
        "the principal URL is empty or unparseable, so there is no routing key",
        "an envelope was hand-assembled and omitted required header fields"
      ],
      "remediation": "Build the envelope through TxBody + SmartSigner rather than by hand. Every transaction needs a header with a valid `principal` — that URL is the routing key, and without it the node rejects the request before validating anything else.",
      "relatedOps": [
        "send_tokens",
        "write_data",
        "add_credits",
        "create_identity"
      ],
      "bindings": {
        "python": "ValidationError",
        "dart": "ApiError",
        "rust": "Error::Routing",
        "csharp": "AccumulateException",
        "javascript": "AccumulateError"
      }
    }
  ]
};
