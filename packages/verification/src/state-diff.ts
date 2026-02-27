/**
 * State Diff Computation
 * Deep comparison of account state before and after transactions
 */

import type { StateDiffEntry } from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

// =============================================================================
// State Diff Computation
// =============================================================================

/**
 * Compute the difference between two account states
 * @param before - State before the transaction (null if account was created)
 * @param after - State after the transaction
 * @returns Flat list of changes with path notation
 */
export function computeStateDiff(
  before: object | null,
  after: object
): StateDiffEntry[] {
  const changes: StateDiffEntry[] = [];

  if (before === null) {
    // Account was created - all fields are additions
    collectAllFields(after as JsonObject, '', changes, 'added');
    return changes;
  }

  // Deep compare the two states
  compareObjects(before as JsonObject, after as JsonObject, '', changes);

  return changes;
}

/**
 * Recursively collect all fields as added or removed
 */
function collectAllFields(
  obj: JsonObject | JsonArray,
  path: string,
  changes: StateDiffEntry[],
  type: 'added' | 'removed'
): void {
  if (Array.isArray(obj)) {
    // Handle arrays
    for (let i = 0; i < obj.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      const item = obj[i];

      if (item !== null && typeof item === 'object') {
        collectAllFields(item as JsonObject | JsonArray, itemPath, changes, type);
      } else {
        changes.push({
          path: itemPath,
          type,
          ...(type === 'added' ? { after: item } : { before: item }),
        });
      }
    }
  } else {
    // Handle objects
    for (const key of Object.keys(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const value = obj[key];

      if (value !== null && typeof value === 'object') {
        collectAllFields(value as JsonObject | JsonArray, fieldPath, changes, type);
      } else {
        changes.push({
          path: fieldPath,
          type,
          ...(type === 'added' ? { after: value } : { before: value }),
        });
      }
    }
  }
}

/**
 * Deep compare two objects and collect differences
 */
function compareObjects(
  before: JsonObject,
  after: JsonObject,
  path: string,
  changes: StateDiffEntry[]
): void {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const fieldPath = path ? `${path}.${key}` : key;
    const beforeValue = before[key];
    const afterValue = after[key];

    // Check if key exists in both
    const inBefore = key in before;
    const inAfter = key in after;

    if (!inBefore && inAfter) {
      // Key was added
      if (afterValue !== null && typeof afterValue === 'object') {
        collectAllFields(afterValue as JsonObject | JsonArray, fieldPath, changes, 'added');
      } else {
        changes.push({
          path: fieldPath,
          type: 'added',
          after: afterValue,
        });
      }
    } else if (inBefore && !inAfter) {
      // Key was removed
      if (beforeValue !== null && typeof beforeValue === 'object') {
        collectAllFields(beforeValue as JsonObject | JsonArray, fieldPath, changes, 'removed');
      } else {
        changes.push({
          path: fieldPath,
          type: 'removed',
          before: beforeValue,
        });
      }
    } else {
      // Key exists in both - compare values
      compareValues(beforeValue, afterValue, fieldPath, changes);
    }
  }
}

/**
 * Compare two values and collect differences
 */
function compareValues(
  before: JsonValue,
  after: JsonValue,
  path: string,
  changes: StateDiffEntry[]
): void {
  // Handle null cases
  if (before === null && after === null) {
    return; // No change
  }

  if (before === null && after !== null) {
    if (typeof after === 'object') {
      collectAllFields(after as JsonObject | JsonArray, path, changes, 'added');
    } else {
      changes.push({ path, type: 'added', after });
    }
    return;
  }

  if (before !== null && after === null) {
    if (typeof before === 'object') {
      collectAllFields(before as JsonObject | JsonArray, path, changes, 'removed');
    } else {
      changes.push({ path, type: 'removed', before });
    }
    return;
  }

  // Type comparison
  const beforeType = Array.isArray(before) ? 'array' : typeof before;
  const afterType = Array.isArray(after) ? 'array' : typeof after;

  if (beforeType !== afterType) {
    // Type changed - treat as full replacement
    changes.push({
      path,
      type: 'changed',
      before,
      after,
    });
    return;
  }

  // Same type comparison
  if (beforeType === 'object') {
    compareObjects(before as JsonObject, after as JsonObject, path, changes);
  } else if (beforeType === 'array') {
    compareArrays(before as JsonArray, after as JsonArray, path, changes);
  } else {
    // Primitive comparison
    if (before !== after) {
      changes.push({
        path,
        type: 'changed',
        before,
        after,
      });
    }
  }
}

/**
 * Compare two arrays and collect differences
 */
function compareArrays(
  before: JsonArray,
  after: JsonArray,
  path: string,
  changes: StateDiffEntry[]
): void {
  const maxLength = Math.max(before.length, after.length);

  for (let i = 0; i < maxLength; i++) {
    const itemPath = `${path}[${i}]`;

    if (i >= before.length) {
      // Item was added
      const item = after[i];
      if (item !== null && typeof item === 'object') {
        collectAllFields(item as JsonObject | JsonArray, itemPath, changes, 'added');
      } else {
        changes.push({
          path: itemPath,
          type: 'added',
          after: item,
        });
      }
    } else if (i >= after.length) {
      // Item was removed
      const item = before[i];
      if (item !== null && typeof item === 'object') {
        collectAllFields(item as JsonObject | JsonArray, itemPath, changes, 'removed');
      } else {
        changes.push({
          path: itemPath,
          type: 'removed',
          before: item,
        });
      }
    } else {
      // Item exists in both - compare
      compareValues(before[i], after[i], itemPath, changes);
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all added entries from a diff
 */
export function getAdditions(diff: StateDiffEntry[]): StateDiffEntry[] {
  return diff.filter((entry) => entry.type === 'added');
}

/**
 * Get all removed entries from a diff
 */
export function getRemovals(diff: StateDiffEntry[]): StateDiffEntry[] {
  return diff.filter((entry) => entry.type === 'removed');
}

/**
 * Get all changed entries from a diff
 */
export function getChanges(diff: StateDiffEntry[]): StateDiffEntry[] {
  return diff.filter((entry) => entry.type === 'changed');
}

/**
 * Check if a specific path was modified
 */
export function wasPathModified(diff: StateDiffEntry[], path: string): boolean {
  return diff.some((entry) => entry.path === path || entry.path.startsWith(`${path}.`));
}

/**
 * Get the change for a specific path
 */
export function getChangeAtPath(diff: StateDiffEntry[], path: string): StateDiffEntry | undefined {
  return diff.find((entry) => entry.path === path);
}

/**
 * Format a diff entry as a human-readable string
 */
export function formatDiffEntry(entry: StateDiffEntry): string {
  switch (entry.type) {
    case 'added':
      return `+ ${entry.path}: ${JSON.stringify(entry.after)}`;
    case 'removed':
      return `- ${entry.path}: ${JSON.stringify(entry.before)}`;
    case 'changed':
      return `~ ${entry.path}: ${JSON.stringify(entry.before)} -> ${JSON.stringify(entry.after)}`;
  }
}

/**
 * Format a complete diff as a human-readable string
 */
export function formatDiff(diff: StateDiffEntry[]): string {
  if (diff.length === 0) {
    return 'No changes';
  }
  return diff.map(formatDiffEntry).join('\n');
}

/**
 * Apply a diff to a state object to produce the new state
 * Warning: This modifies the input object. Clone first if needed.
 */
export function applyDiff(state: JsonObject, diff: StateDiffEntry[]): JsonObject {
  for (const entry of diff) {
    const parts = parsePath(entry.path);

    if (entry.type === 'removed') {
      deletePath(state, parts);
    } else {
      setPath(state, parts, entry.after);
    }
  }
  return state;
}

/**
 * Parse a path string into parts
 * e.g., "foo.bar[0].baz" -> ["foo", "bar", 0, "baz"]
 */
function parsePath(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  const regex = /([^.\[\]]+)|\[(\d+)\]/g;
  let match;

  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1]);
    } else if (match[2] !== undefined) {
      parts.push(parseInt(match[2], 10));
    }
  }

  return parts;
}

/**
 * Set a value at a path in an object
 */
function setPath(obj: JsonObject, parts: (string | number)[], value: JsonValue): void {
  let current: JsonValue = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];

    if (typeof part === 'number') {
      const arr = current as JsonArray;
      if (arr[part] === undefined) {
        arr[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = arr[part];
    } else {
      const o = current as JsonObject;
      if (o[part] === undefined) {
        o[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = o[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (typeof lastPart === 'number') {
    (current as JsonArray)[lastPart] = value;
  } else {
    (current as JsonObject)[lastPart] = value;
  }
}

/**
 * Delete a value at a path in an object
 */
function deletePath(obj: JsonObject, parts: (string | number)[]): void {
  let current: JsonValue = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof part === 'number') {
      current = (current as JsonArray)[part];
    } else {
      current = (current as JsonObject)[part];
    }
    if (current === undefined) return;
  }

  const lastPart = parts[parts.length - 1];
  if (typeof lastPart === 'number') {
    (current as JsonArray).splice(lastPart, 1);
  } else {
    delete (current as JsonObject)[lastPart];
  }
}
