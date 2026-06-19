/**
 * Node-only bundle zipping.
 *
 * NODE ONLY — this module pulls in `archiver` + `stream` + `Buffer` and must
 * never be imported from browser code. It is intentionally NOT re-exported from
 * `index.ts`, so a browser app that imports `@accumulate-studio/codegen` does
 * not drag these Node modules into its bundle graph. Browser callers must use
 * `apps/studio/src/services/export/bundle-to-zip.ts` (fflate-based) instead.
 */

import type { Flow } from '@accumulate-studio/types';
import { generateBundle, type Bundle, type BundleOptions } from './bundle-generator';

/**
 * Generate a ZIP archive from a bundle (Node.js environment only).
 */
export async function generateBundleZip(bundle: Bundle): Promise<Buffer> {
  // Dynamic import for archiver (only available in Node.js)
  const archiver = await import('archiver');
  const { Writable } = await import('stream');

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Create a writable stream to collect chunks
    const writableStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    // Create archive
    const archive = archiver.default('zip', {
      zlib: { level: 9 },
    });

    // Handle events
    archive.on('error', reject);
    writableStream.on('finish', () => {
      resolve(Buffer.concat(chunks));
    });

    // Pipe archive to writable stream
    archive.pipe(writableStream);

    // Add files to archive
    for (const file of bundle.files) {
      archive.append(file.content, { name: file.path });
    }

    // Finalize
    archive.finalize();
  });
}

/**
 * Generate bundle and return as ZIP buffer (Node.js environment only).
 */
export async function generateBundleAsZip(
  flow: Flow,
  options: Partial<BundleOptions> = {}
): Promise<{ bundle: Bundle; zipBuffer: Buffer }> {
  const bundle = await generateBundle(flow, options);
  const zipBuffer = await generateBundleZip(bundle);
  return { bundle, zipBuffer };
}
