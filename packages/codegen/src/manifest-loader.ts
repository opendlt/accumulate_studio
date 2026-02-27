/**
 * Manifest Loader - Load bundled SDK manifests
 */

import type { SDKLanguage, SDKMap } from '@accumulate-studio/types';

// Static imports of bundled manifests
import pythonManifest from './manifests/python.sdk-manifest.json';
import rustManifest from './manifests/rust.sdk-manifest.json';
import dartManifest from './manifests/dart.sdk-manifest.json';
import csharpManifest from './manifests/csharp.sdk-manifest.json';
import javascriptManifest from './manifests/javascript.sdk-manifest.json';

const MANIFESTS: Partial<Record<SDKLanguage, SDKMap>> = {
  python: pythonManifest as unknown as SDKMap,
  rust: rustManifest as unknown as SDKMap,
  dart: dartManifest as unknown as SDKMap,
  csharp: csharpManifest as unknown as SDKMap,
  javascript: javascriptManifest as unknown as SDKMap,
};

/**
 * Load the SDK manifest for a specific language
 */
export function loadManifest(language: SDKLanguage): SDKMap | null {
  return MANIFESTS[language] ?? null;
}

/**
 * Load all available SDK manifests
 */
export function loadAllManifests(): Partial<Record<SDKLanguage, SDKMap>> {
  return { ...MANIFESTS };
}
