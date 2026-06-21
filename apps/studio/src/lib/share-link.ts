import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Flow } from '@accumulate-studio/types';
import { sanitizeFlow } from '../store/flow-store';

export const MAX_ENCODED_LENGTH = 8192;
const PARAM = 'flow';

export interface EncodeResult {
  ok: boolean;
  payload?: string; // url-safe, ready to put after #flow=
  length?: number;
  error?: string;
}

/** Serialize a flow to a compact, URL-safe payload string. */
export function encodeFlowToPayload(flow: Flow): EncodeResult {
  try {
    // Encode only the persisted shape (drop transient/runtime fields).
    const minimal = {
      version: flow.version,
      name: flow.name,
      description: flow.description,
      variables: flow.variables,
      nodes: flow.nodes,
      connections: flow.connections,
      assertions: flow.assertions,
      metadata: flow.metadata,
    };
    const json = JSON.stringify(minimal);
    const payload = compressToEncodedURIComponent(json);
    if (payload.length > MAX_ENCODED_LENGTH) {
      return { ok: false, error: 'too-large', length: payload.length };
    }
    return { ok: true, payload, length: payload.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Build a full shareable URL using the location hash. */
export function buildShareUrl(
  flow: Flow,
  origin = window.location.origin,
  pathname = window.location.pathname
): EncodeResult & { url?: string } {
  const res = encodeFlowToPayload(flow);
  if (!res.ok || !res.payload) return res;
  return { ...res, url: `${origin}${pathname}#${PARAM}=${res.payload}` };
}

/**
 * Decode a payload back into a SAFE flow (validated + migrated via sanitizeFlow).
 * Returns null if the payload is missing, oversized, or undecodable. When the
 * payload decodes to JSON but fails structural validation, sanitizeFlow returns
 * a fresh empty flow (never throws) — callers detect that via nodes.length.
 */
export function decodeFlowFromPayload(payload: string | null | undefined): Flow | null {
  if (!payload) return null;
  if (payload.length > MAX_ENCODED_LENGTH) return null;
  let json: string | null = null;
  try {
    json = decompressFromEncodedURIComponent(payload);
  } catch {
    return null;
  }
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  // CRITICAL: never trust the decoded object — run it through the same
  // validate/migrate path the persist layer uses (P1-6 sanitizeFlow).
  return sanitizeFlow(parsed);
}

/**
 * Extract a single param value from a raw `a=1&b=2` param string WITHOUT
 * form-decoding. lz-string's URL-safe alphabet includes '+', '-' and '$'; using
 * URLSearchParams here would silently turn every '+' into a space and corrupt
 * the payload. None of the alphabet needs percent-decoding, so a plain split is
 * both safe and lossless.
 */
function extractParam(paramString: string, key: string): string | null {
  if (!paramString) return null;
  for (const part of paramString.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === key) return part.slice(eq + 1);
  }
  return null;
}

/** Drop a single param from a raw param string, preserving the rest verbatim. */
function stripParam(paramString: string, key: string): string {
  if (!paramString) return '';
  return paramString
    .split('&')
    .filter((part) => {
      if (part === '') return false;
      const eq = part.indexOf('=');
      const k = eq === -1 ? part : part.slice(0, eq);
      return k !== key;
    })
    .join('&');
}

/** Read a flow payload from the current URL (hash preferred, query fallback). */
export function readPayloadFromLocation(
  loc: { hash: string; search: string } = window.location
): string | null {
  const hash = loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.hash;
  const fromHash = extractParam(hash, PARAM);
  if (fromHash) return fromHash;
  const search = loc.search.startsWith('?') ? loc.search.slice(1) : loc.search;
  return extractParam(search, PARAM);
}

/** Remove the flow payload from the URL without reloading (so refresh won't re-prompt). */
export function clearPayloadFromLocation(): void {
  const { origin, pathname, search, hash } = window.location;
  const cleanQuery = stripParam(search.startsWith('?') ? search.slice(1) : search, PARAM);
  const cleanHash = stripParam(hash.startsWith('#') ? hash.slice(1) : hash, PARAM);
  const url =
    origin +
    pathname +
    (cleanQuery ? `?${cleanQuery}` : '') +
    (cleanHash ? `#${cleanHash}` : '');
  window.history.replaceState(null, '', url);
}
