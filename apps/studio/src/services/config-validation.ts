import { BLOCK_CATALOG, type BlockType, type Flow } from '@accumulate-studio/types';

interface SchemaShape {
  properties?: Record<string, { description?: string }>;
  required?: string[];
}

/** A required field is "auto-resolved" if its description opts into runtime resolution. */
export function isAutoResolved(desc?: string): boolean {
  if (!desc) return false;
  return desc.includes('auto-resolved') || desc.includes('auto-fetched');
}

/** True when a config value is considered empty for required-ness. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Returns the names of required fields that are empty and NOT auto-resolved.
 */
export function getMissingRequiredFields(
  blockType: BlockType,
  config: Record<string, unknown> | undefined
): string[] {
  const def = BLOCK_CATALOG[blockType];
  if (!def) return [];
  const schema = def.configSchema as SchemaShape;
  const required = schema.required ?? [];
  const props = schema.properties ?? {};
  const cfg = config ?? {};

  return required.filter((field) => {
    if (isAutoResolved(props[field]?.description)) return false;
    return isEmpty(cfg[field]);
  });
}

/** Count of nodes in a flow that have ≥1 missing required field. */
export function countNodesWithMissingFields(flow: Flow): number {
  return flow.nodes.reduce((n, node) => {
    const missing = getMissingRequiredFields(
      node.type,
      node.config as Record<string, unknown>
    );
    return n + (missing.length > 0 ? 1 : 0);
  }, 0);
}
