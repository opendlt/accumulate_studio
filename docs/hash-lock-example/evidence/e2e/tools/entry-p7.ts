// P7 scratch exporter (never committed): the shipped hash-lock template exactly as the UI download produces it,
// plus TEST-ONLY variants selected by env: HTLC_ALG=sha256d, HTLC_WRONG_PREIMAGE=1.
// Usage: node export-p7.bundle.mjs <language> <outDir> [network]
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { generateProject } from 'C:/Accumulate_Stuff/on-boarding-platform/accumulate-studio/packages/codegen/src/index';
import { GOLDEN_PATH_TEMPLATES } from 'C:/Accumulate_Stuff/on-boarding-platform/accumulate-studio/apps/studio/src/data/flow-templates';

const [language, outDir, network = 'kermit'] = process.argv.slice(2);
if (!language || !outDir) { console.error('usage: export-p7.bundle.mjs <language> <outDir> [network]'); process.exit(2); }
const t = GOLDEN_PATH_TEMPLATES.find((x: any) => x.id === 'hash-lock');
if (!t) { console.error('no hash-lock template'); process.exit(2); }
const flow: any = JSON.parse(JSON.stringify(t.flow));
flow.network = network;
if (process.env.HTLC_ALG) flow.nodes.find((n: any) => n.id === 'create_hash_lock').config.hashAlgorithm = process.env.HTLC_ALG;
if (process.env.HTLC_WRONG_PREIMAGE) flow.nodes.find((n: any) => n.id === 'release_locked').config.preimage = 'ff'.repeat(32);
const files = generateProject(flow, language as any);
for (const f of files) {
  const p = join(outDir, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content);
}
console.log(`hash-lock/${language}${process.env.HTLC_ALG ? ' ' + process.env.HTLC_ALG : ''}${process.env.HTLC_WRONG_PREIMAGE ? ' WRONG-PREIMAGE' : ''}: wrote ${files.length} files to ${outDir}: ${files.map((f: any) => f.path).join(', ')}`);
