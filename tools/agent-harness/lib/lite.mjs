/**
 * lite.mjs — Ed25519 keypair generation and Accumulate lite-account derivation.
 *
 * Derivation (verified live on Kermit 2026-07-27 — the faucet accepted the
 * derived URL and the network created the account):
 *   keyHash   = sha256(rawPublicKey32)
 *   key20     = first 20 bytes of keyHash, lowercase hex   (40 chars)
 *   checksum  = last 4 bytes of sha256(ASCII of key20)     (8 chars)
 *   lite identity      = acc://<key20><checksum>
 *   lite token account = <lite identity>/ACME
 *
 * The checksum hashes the ASCII of the hex string, NOT the raw bytes. Getting
 * that wrong yields a URL the faucet accepts but that never materializes.
 */

import crypto from 'node:crypto';

/** Generate an Ed25519 keypair and derive its lite URLs. */
export function generateLiteAccount() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // SPKI DER for Ed25519 is a 12-byte header + the 32-byte raw key.
  const rawPublic = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  // PKCS8 DER for Ed25519 is a 16-byte header + the 32-byte raw seed.
  const rawPrivate = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);

  const keyHash = crypto.createHash('sha256').update(rawPublic).digest();
  const key20 = keyHash.subarray(0, 20).toString('hex');
  const checksum = crypto
    .createHash('sha256')
    .update(Buffer.from(key20, 'utf8'))
    .digest()
    .subarray(28, 32)
    .toString('hex');

  const liteIdentity = `acc://${key20}${checksum}`;

  return {
    publicKeyHex: rawPublic.toString('hex'),
    privateKeyHex: rawPrivate.toString('hex'),
    /** Full 32-byte sha256 of the public key — what key pages store. */
    publicKeyHashHex: keyHash.toString('hex'),
    liteIdentity,
    liteTokenAccount: `${liteIdentity}/ACME`,
  };
}

/** Derive the lite URLs for an existing raw public key (hex or Buffer). */
export function deriveLiteUrls(rawPublicKey) {
  const raw = Buffer.isBuffer(rawPublicKey) ? rawPublicKey : Buffer.from(rawPublicKey, 'hex');
  if (raw.length !== 32) throw new Error(`expected a 32-byte Ed25519 public key, got ${raw.length}`);
  const keyHash = crypto.createHash('sha256').update(raw).digest();
  const key20 = keyHash.subarray(0, 20).toString('hex');
  const checksum = crypto
    .createHash('sha256')
    .update(Buffer.from(key20, 'utf8'))
    .digest()
    .subarray(28, 32)
    .toString('hex');
  const liteIdentity = `acc://${key20}${checksum}`;
  return {
    liteIdentity,
    liteTokenAccount: `${liteIdentity}/ACME`,
    publicKeyHashHex: keyHash.toString('hex'),
  };
}

/**
 * A collision-resistant ADI label for a run. Task 02 declares
 * `adi_url: acc://<generated>.acme`; this supplies the <generated> part.
 */
export function suggestAdiUrl(seed = '') {
  const rand = crypto.randomBytes(4).toString('hex');
  const tag = seed ? `${String(seed).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12)}-` : '';
  return `acc://harness-${tag}${rand}.acme`;
}
