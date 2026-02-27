/**
 * Tools Index
 * Export all MCP tools
 */

export * from './network.js';
export * from './query.js';
export * from './transaction.js';
export * from './verification.js';

import { networkTools } from './network.js';
import { queryTools } from './query.js';
import { transactionTools } from './transaction.js';
import { verificationTools } from './verification.js';

/**
 * All registered MCP tools
 */
export const allTools = [
  ...networkTools,
  ...queryTools,
  ...transactionTools,
  ...verificationTools,
];

/**
 * Tool lookup by name
 */
export const toolsByName = Object.fromEntries(
  allTools.map((tool) => [tool.name, tool])
);

/**
 * Get a tool by name
 */
export function getTool(name: string) {
  return toolsByName[name];
}
