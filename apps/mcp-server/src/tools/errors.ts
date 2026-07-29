/**
 * Error Tools (RB-05)
 *
 * `acc.explain_error` is the highest-leverage tool for an agent that is stuck.
 * An agent holding a raw protocol string — `unauthorized: key does not belong to
 * signer` — has no way to know whether that is worth retrying. Retrying it is
 * the classic wasted-turn pattern K3 measures. This maps the raw string onto the
 * canonical catalog and answers the only two questions that matter: what caused
 * it, and is a retry productive.
 *
 * READ-tier: it consults a static catalog and touches no network.
 */

import {
  OperationCategory,
  ToolResponse,
  successResponse,
  errorFromException,
  requirePermission,
} from '../permissions.js';

import { ERROR_CATALOG, type ErrorCatalogEntry } from '../generated/content.js';

// =============================================================================
// Matching
// =============================================================================

export interface ExplainErrorArgs {
  /** The raw error string, message, or `ACC_*` code. */
  error: string;
  /** Optional numeric protocol/JSON-RPC code, if the caller has one. */
  code?: number;
  /** Optional language, to return the concrete thrown type and catch syntax. */
  language?: string;
}

export interface ExplainErrorMatch {
  code: string;
  category: string;
  retryable: boolean;
  hint: string;
  causes: string[];
  remediation: string;
  relatedOps: string[];
  /** How this entry was matched — so a caller can judge the confidence. */
  matchedBy: 'code' | 'protocolCode' | 'messagePattern';
  /** Present when `language` was supplied. */
  languageType?: string;
  catchSyntax?: string;
}

export interface ExplainErrorResult {
  matched: boolean;
  /** Best match first. Usually one; ambiguous strings can yield several. */
  matches: ExplainErrorMatch[];
  /** The actionable summary: retry, or do not. */
  guidance: string;
  catalogVersion: string;
}

function toMatch(
  e: ErrorCatalogEntry,
  matchedBy: ExplainErrorMatch['matchedBy'],
  language?: string,
): ExplainErrorMatch {
  const m: ExplainErrorMatch = {
    code: e.code,
    category: e.category,
    retryable: e.retryable,
    hint: e.hint,
    causes: e.causes,
    remediation: e.remediation,
    relatedOps: e.relatedOps,
    matchedBy,
  };
  if (language) {
    const type = e.bindings[language];
    if (type) m.languageType = type;
    const binding = ERROR_CATALOG.bindings[language];
    if (binding) m.catchSyntax = binding.catch;
  }
  return m;
}

/**
 * Resolve a raw error to catalog entries.
 *
 * Precedence is deliberate: an explicit `ACC_*` code or a numeric wire code is
 * exact, so it wins outright. Message-pattern matching is a fallback and can be
 * ambiguous — every pattern hit is returned, longest (most specific) first,
 * rather than silently picking one.
 */
export function matchError(
  raw: string,
  code?: number,
  language?: string,
): ExplainErrorMatch[] {
  const text = (raw || '').toLowerCase();

  const byCode = ERROR_CATALOG.errors.find(
    (e) => e.code.toLowerCase() === text.trim(),
  );
  if (byCode) return [toMatch(byCode, 'code', language)];

  if (typeof code === 'number') {
    const byProtocol = ERROR_CATALOG.errors.find((e) =>
      e.protocolCodes.includes(code),
    );
    if (byProtocol) return [toMatch(byProtocol, 'protocolCode', language)];
  }

  // A numeric code embedded in the raw string (e.g. "... (-33404)").
  for (const e of ERROR_CATALOG.errors) {
    if (e.protocolCodes.some((p) => text.includes(String(p)))) {
      return [toMatch(e, 'protocolCode', language)];
    }
  }

  const hits: Array<{ entry: ErrorCatalogEntry; len: number }> = [];
  for (const e of ERROR_CATALOG.errors) {
    let best = 0;
    for (const p of e.messagePatterns) {
      if (p && text.includes(p.toLowerCase())) best = Math.max(best, p.length);
    }
    if (best > 0) hits.push({ entry: e, len: best });
  }
  hits.sort((a, b) => b.len - a.len);
  return hits.map((h) => toMatch(h.entry, 'messagePattern', language));
}

// =============================================================================
// Tool: acc.explain_error
// =============================================================================

export async function explainError(
  args: ExplainErrorArgs,
): Promise<ToolResponse<ExplainErrorResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const matches = matchError(args.error, args.code, args.language);

    if (matches.length === 0) {
      return successResponse(
        {
          matched: false,
          matches: [],
          guidance:
            'No catalog entry matched. Treat as NOT retryable until identified — an unrecognized error is more often a malformed request than a transient fault. Read `accumulate://errors` for the full catalog, and re-check the operation inputs in llms-full.txt.',
          catalogVersion: ERROR_CATALOG.version,
        },
        ['Unmatched error — the catalog may need a new entry for this case.'],
      );
    }

    const best = matches[0];
    const guidance = best.retryable
      ? `RETRY is productive: ${best.code} is a \`${best.category}\` error. Retry with exponential backoff. ${best.remediation}`
      : `DO NOT RETRY: ${best.code} is a \`${best.category}\` error — the condition will not change on its own, so a retry only burns a turn. ${best.remediation}`;

    const warnings =
      matches.length > 1
        ? [
            `Ambiguous: ${matches.length} entries matched on message text. Best match first (${matches.map((m) => m.code).join(', ')}).`,
          ]
        : undefined;

    return successResponse(
      {
        matched: true,
        matches,
        guidance,
        catalogVersion: ERROR_CATALOG.version,
      },
      warnings,
    );
  } catch (error) {
    return errorFromException(error);
  }
}

export const explainErrorTool = {
  name: 'acc.explain_error',
  description:
    'Explain an Accumulate error: map a raw error string or code to its canonical catalog entry, its likely causes, the concrete fix, and — critically — whether retrying is productive. Call this instead of guessing when a transaction or query fails.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      error: {
        type: 'string',
        description:
          'The raw error message, string, or ACC_* code, exactly as the SDK reported it.',
      },
      code: {
        type: 'number',
        description: 'Numeric protocol or JSON-RPC error code, if available.',
      },
      language: {
        type: 'string',
        enum: ['python', 'rust', 'dart', 'csharp', 'javascript'],
        description:
          'Return the concrete thrown type and catch syntax for this language.',
      },
    },
    required: ['error'] as string[],
  },
  handler: explainError,
};

export const errorTools = [explainErrorTool];
