/**
 * MCP Resources — application-controlled context an agent can READ.
 *
 * Before RB-02 this server exposed only Tools, which meant an agent could call
 * `acc.query` but could not learn that 1 ACME = 1e8 base units, that a key page
 * needs credits before it can sign, or what operations the SDKs offer. It had to
 * already know Accumulate to use the tools. Resources close that gap.
 *
 * URI scheme:
 *   accumulate://concepts/{topic}
 *   accumulate://networks
 *   accumulate://sdk/{lang}/operations
 *   accumulate://templates/{id}
 *
 * Static URIs are listed by `resources/list`; the parameterized families are
 * advertised via `resources/templates/list` so we do not enumerate 5 langs x N
 * files as flat entries.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { NETWORKS } from '@accumulate-studio/types';

import {
  CONCEPTS,
  OPERATION_CATALOGS,
  GOLDEN_PATHS,
  SDK_LANGUAGES,
  ERROR_CATALOG,
} from '../generated/content.js';

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceTemplateDescriptor {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

const MIME_MD = 'text/markdown';
const MIME_JSON = 'application/json';

/** Concrete resources. Kept small and high-value — each one costs agent context. */
export const staticResources: ResourceDescriptor[] = [
  ...Object.values(CONCEPTS).map((c) => ({
    uri: `accumulate://concepts/${c.id}`,
    name: c.title,
    description: `Accumulate concept: ${c.title}`,
    mimeType: MIME_MD,
  })),
  {
    uri: 'accumulate://networks',
    name: 'Network registry',
    description:
      'Available Accumulate networks with endpoints, faucet availability, and which is currently selected.',
    mimeType: MIME_JSON,
  },
  {
    uri: 'accumulate://templates',
    name: 'Golden-path templates',
    description: 'The canonical end-to-end Accumulate workflows, with steps and prerequisites.',
    mimeType: MIME_JSON,
  },
  {
    uri: 'accumulate://errors',
    name: 'Error catalog',
    description:
      'Every Accumulate error code with its category, whether a retry is productive (`retryable`), the likely causes, and the concrete fix. Read this before retrying anything.',
    mimeType: MIME_JSON,
  },
];

export const resourceTemplates: ResourceTemplateDescriptor[] = [
  {
    uriTemplate: 'accumulate://sdk/{language}/operations',
    name: 'SDK operation catalog',
    description: `Machine-readable operation catalog with symbols, signatures, inputs, outputs, and prerequisites. Languages: ${SDK_LANGUAGES.join(', ')}.`,
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: 'accumulate://concepts/{topic}',
    name: 'Accumulate concept',
    description: `Explanations of Accumulate's model. Topics: ${Object.keys(CONCEPTS).join(', ')}.`,
    mimeType: MIME_MD,
  },
  {
    uriTemplate: 'accumulate://templates/{id}',
    name: 'Golden-path template',
    description: `A single canonical workflow. Ids: ${GOLDEN_PATHS.map((t) => t.id).join(', ')}.`,
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: 'accumulate://errors/{code}',
    name: 'Error catalog entry',
    description: `A single error with its cause and fix. Codes: ${ERROR_CATALOG.errors.map((e) => e.code).join(', ')}.`,
    mimeType: MIME_JSON,
  },
];

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Read a resource by URI.
 *
 * @param currentNetwork the server's selected network, so accumulate://networks
 *        reflects live state rather than a build-time snapshot.
 */
export function readResource(uri: string, currentNetwork: string): ResourceContents {
  const concept = uri.match(/^accumulate:\/\/concepts\/([\w-]+)$/);
  if (concept) {
    const doc = CONCEPTS[concept[1]];
    if (!doc) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown concept "${concept[1]}". Available: ${Object.keys(CONCEPTS).join(', ')}`,
      );
    }
    return { uri, mimeType: MIME_MD, text: doc.body };
  }

  if (uri === 'accumulate://networks') {
    const networks = Object.values(NETWORKS).map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      v2Endpoint: n.v2Endpoint,
      v3Endpoint: n.v3Endpoint,
      faucetAvailable: n.faucetAvailable,
      readOnly: n.readOnly ?? false,
      isCurrent: n.id === currentNetwork,
    }));
    return {
      uri,
      mimeType: MIME_JSON,
      text: JSON.stringify(
        {
          current: currentNetwork,
          safetyDefault:
            'This server defaults to testnet and never selects mainnet implicitly.',
          networks,
        },
        null,
        2,
      ),
    };
  }

  const sdk = uri.match(/^accumulate:\/\/sdk\/([\w-]+)\/operations$/);
  if (sdk) {
    const cat = OPERATION_CATALOGS[sdk[1]];
    if (!cat) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown SDK language "${sdk[1]}". Available: ${SDK_LANGUAGES.join(', ')}`,
      );
    }
    return { uri, mimeType: MIME_JSON, text: JSON.stringify(cat, null, 2) };
  }

  if (uri === 'accumulate://templates') {
    return { uri, mimeType: MIME_JSON, text: JSON.stringify(GOLDEN_PATHS, null, 2) };
  }

  if (uri === 'accumulate://errors') {
    return { uri, mimeType: MIME_JSON, text: JSON.stringify(ERROR_CATALOG, null, 2) };
  }

  const errCode = uri.match(/^accumulate:\/\/errors\/([A-Z0-9_]+)$/);
  if (errCode) {
    const entry = ERROR_CATALOG.errors.find((e) => e.code === errCode[1]);
    if (!entry) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown error code "${errCode[1]}". Available: ${ERROR_CATALOG.errors.map((e) => e.code).join(', ')}`,
      );
    }
    return { uri, mimeType: MIME_JSON, text: JSON.stringify(entry, null, 2) };
  }

  const tpl = uri.match(/^accumulate:\/\/templates\/([\w-]+)$/);
  if (tpl) {
    const t = GOLDEN_PATHS.find((x) => x.id === tpl[1]);
    if (!t) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown template "${tpl[1]}". Available: ${GOLDEN_PATHS.map((x) => x.id).join(', ')}`,
      );
    }
    return { uri, mimeType: MIME_JSON, text: JSON.stringify(t, null, 2) };
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Unknown resource URI "${uri}". Valid prefixes: accumulate://concepts/, accumulate://networks, accumulate://sdk/{language}/operations, accumulate://templates/, accumulate://errors/`,
  );
}

export const resourceCount = staticResources.length;
