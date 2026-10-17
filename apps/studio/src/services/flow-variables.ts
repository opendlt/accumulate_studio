/**
 * Flow variables for a run.
 *
 * A flow declares variables (ADI_NAME, LOCK_AMOUNT, ...). Some are `required` with no default, so the
 * person running the flow has to supply them. This module is the single place that decides what a
 * variable's value may be: the Execute dialog uses it to guide the entry, and the engine uses it as a
 * hard gate before anything touches the network, so no entry point can run with a missing value.
 *
 * Values are text as typed. A run's values are DEFAULTS overlaid with what the person entered; the
 * flow's own `default`s are never rewritten, so saved flows, exports and generated code stay clean.
 */

import type { FlowVariable } from '@accumulate-studio/types';

/** What the person typed, keyed by variable name. */
export type VariableValues = Record<string, string>;

/** name -> message, for every variable whose value cannot be used */
export type VariableErrors = Record<string, string>;

const HEX = /^([0-9a-fA-F]{2})*$/;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** A variable's default as text; empty when it has none. */
function defaultText(variable: FlowVariable): string {
  return isEmpty(variable.default) ? '' : String(variable.default);
}

/** The Execute dialog's starting values: every variable's default, as text. */
export function initialVariableValues(variables: FlowVariable[]): VariableValues {
  const values: VariableValues = {};
  for (const variable of variables) values[variable.name] = defaultText(variable);
  return values;
}

/**
 * Why `raw` cannot be used for `variable`, or null when it can. An empty optional variable is fine;
 * an empty required one is not. Formats follow the variable's declared type.
 */
export function validateVariableValue(variable: FlowVariable, raw: unknown): string | null {
  if (isEmpty(raw)) return variable.required ? 'Required' : null;
  const value = String(raw).trim();

  switch (variable.type) {
    case 'decimal':
      // At most 8 places: ACME has 8 decimals, anything finer would be silently rounded.
      return /^\d+(\.\d{1,8})?$/.test(value) ? null : 'Enter a number with at most 8 decimal places, e.g. 1.5';
    case 'int':
      return /^\d+$/.test(value) ? null : 'Enter a whole number';
    case 'url':
      return /^acc:\/\/\S+$/.test(value) ? null : 'Enter an Accumulate URL starting with acc://';
    case 'bool':
      return value === 'true' || value === 'false' ? null : 'Enter true or false';
    case 'bytes':
      return HEX.test(value) ? null : 'Enter hex (an even number of 0-9 a-f characters)';
    case 'object':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'Enter valid JSON';
      }
    default:
      // string: free text (a name, a message). Only "not empty" applies, which was checked above.
      return null;
  }
}

/** Every variable that cannot run with `values`, by name. Empty means the flow is ready to run. */
export function variableErrors(variables: FlowVariable[], values: VariableValues): VariableErrors {
  const errors: VariableErrors = {};
  for (const variable of variables) {
    const message = validateVariableValue(variable, values[variable.name]);
    if (message) errors[variable.name] = message;
  }
  return errors;
}

/**
 * The values a run uses: each variable's default, overlaid with `provided` (trimmed; an empty entry
 * keeps the default). Names the flow does not declare are ignored. Throws, naming every offender, when a value is missing or malformed,
 * so the engine fails before the first network call instead of sending `acc://{{ADI_NAME}}.acme`.
 */
export function resolveRunVariables(
  variables: FlowVariable[],
  provided: VariableValues = {}
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const asText: VariableValues = {};

  for (const variable of variables) {
    // An empty entry keeps the default (clearing an optional field must not blank it); with no
    // default there is nothing to keep and it stays an empty value, as it always did
    const entered = provided[variable.name]?.trim();
    const value = entered === undefined || (entered === '' && !isEmpty(variable.default)) ? variable.default : entered;
    asText[variable.name] = isEmpty(value) ? '' : String(value);
    if (value !== undefined && value !== null) resolved[variable.name] = value;
  }

  const errors = variableErrors(variables, asText);
  const names = Object.keys(errors);
  if (names.length > 0) {
    const detail = names.map((name) => `${name} (${errors[name]})`).join(', ');
    throw new Error(`Cannot run: ${names.length === 1 ? 'a flow variable needs a value' : 'flow variables need values'}: ${detail}`);
  }
  return resolved;
}
