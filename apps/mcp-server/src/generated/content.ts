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
    "body": "# Key books, key pages, and authorities\n\n- **Key book** (`acc://you.acme/book`) — the authority set for an ADI.\n- **Key page** (`acc://you.acme/book/1`) — an ordered set of keys plus a\n  signature threshold. Pages hold credits and are what actually sign.\n- **Threshold** — how many distinct keys on the page must sign. Threshold 2 with\n  2 keys is a 2-of-2 multisig.\n\n## The rule that surprises people\n\nAccumulate requires **all** authorities on an account to approve a transaction.\nWhen updating a key page that has its own book (e.g. `multisig-book/1`), sign\nwith **that page's own book**, not the ADI's default `book`. Signing with the\npage's own book satisfies both the ADI authority and the page's own authority.\n\n## Key rotation\n\nRotate by updating the page: add the new key, then remove the old one. Keys are\nstored as `sha256(publicKey)` hashes, not raw public keys — compare hashes when\nverifying a rotation took effect."
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
      }
    ]
  },
  "rust": {
    "language": "rust",
    "display": "Rust",
    "package": "accumulate-sdk",
    "install": "cargo add accumulate-sdk",
    "sdkVersion": "2.3.1",
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
      }
    ]
  },
  "dart": {
    "language": "dart",
    "display": "Dart",
    "package": "opendlt_accumulate",
    "install": "dart pub add opendlt_accumulate",
    "sdkVersion": "2.3.2",
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
      }
    ]
  },
  "csharp": {
    "language": "csharp",
    "display": "C#",
    "package": "Acme.Net.Sdk",
    "install": "dotnet add package Acme.Net.Sdk",
    "sdkVersion": "2.3.1",
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
    "description": "Complete multi-sig flow from scratch. Sets up keys, creates an ADI, then creates a key book with 3 signers and a 2-of-3 threshold.",
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
      "Set the signature threshold (2 of 3)"
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
