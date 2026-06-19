/**
 * Browser-safe bundle → zip conversion.
 *
 * Uses fflate (no Node Buffer/stream/archiver), so it is safe in the Vite
 * browser bundle. The Node-only zipper lives in the codegen package's
 * bundle-generator.node.ts and must not be imported here.
 */

import { zipSync, strToU8 } from 'fflate';
import type { Bundle } from '@accumulate-studio/codegen';

/**
 * Convert a generated Bundle into a zip Uint8Array, fully in-browser.
 */
export function bundleToZipBytes(bundle: Bundle): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of bundle.files) {
    // strToU8 produces UTF-8 bytes without Buffer.
    entries[file.path] = strToU8(file.content);
  }
  // level 6 is a good size/speed tradeoff for text payloads.
  return zipSync(entries, { level: 6 });
}

/** Trigger a browser download of raw bytes as a named file. */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/zip',
): void {
  // Copy into a fresh ArrayBuffer-backed view so Blob gets a clean buffer.
  const blob = new Blob([bytes.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
