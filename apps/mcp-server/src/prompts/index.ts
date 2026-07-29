/**
 * MCP Prompts — user-invoked workflow templates.
 *
 * The 8 golden paths are the most validated asset in this project: each has a
 * working node graph, ordered instructions, and stated prerequisites. Without
 * the prompts capability they were invisible to MCP hosts — a user could not
 * type `/accumulate:create-adi` and get a workflow known to work.
 *
 * A prompt returns INSTRUCTIONS for the agent, not a node graph. The graph is
 * Studio's payload format; an agent needs steps, prerequisites, and the rules
 * that keep it out of the two most common failure modes (amount scaling and
 * missing credits).
 */

import {
  ErrorCode,
  McpError,
  type GetPromptResult,
} from '@modelcontextprotocol/sdk/types.js';

import { GOLDEN_PATHS, type GoldenPathTemplate } from '../generated/content.js';
import { PermissionMode } from '../permissions.js';

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDescriptor {
  name: string;
  description: string;
  arguments: PromptArgument[];
}

/** Every golden path takes a network; signing paths also accept an ADI label. */
function argumentsFor(t: GoldenPathTemplate): PromptArgument[] {
  const args: PromptArgument[] = [
    {
      name: 'network',
      description: 'Target network (default: kermit). Never mainnet for a first run.',
      required: false,
    },
  ];
  if (/adi|token|data|multisig|rotation/i.test(`${t.id} ${t.tags.join(' ')}`)) {
    args.push({
      name: 'adiName',
      description: 'Label for the ADI, without the acc:// prefix or .acme suffix.',
      required: false,
    });
  }
  return args;
}

export const allPrompts: PromptDescriptor[] = GOLDEN_PATHS.map((t) => ({
  name: t.id,
  description: `${t.name} — ${t.description} (${t.category}, ~${t.estimatedTime})`,
  arguments: argumentsFor(t),
}));

/** Does this workflow end in a state-changing submit? */
function requiresSubmit(t: GoldenPathTemplate): boolean {
  return !/^lite-account-setup$/.test(t.id);
}

/**
 * Build a prompt.
 *
 * @param mode the server's permission mode. A workflow whose final step will be
 *        refused must SAY so — silently emitting steps that cannot complete is
 *        exactly the dead end that costs an agent a wasted turn.
 */
export function getPrompt(
  name: string,
  args: Record<string, string> = {},
  mode: PermissionMode = PermissionMode.BUILD_ONLY,
): GetPromptResult {
  const t = GOLDEN_PATHS.find((x) => x.id === name);
  if (!t) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Unknown prompt "${name}". Available: ${GOLDEN_PATHS.map((x) => x.id).join(', ')}`,
    );
  }

  const network = args.network || 'kermit';
  const adiName = args.adiName;

  const lines: string[] = [];
  lines.push(`# ${t.name}`);
  lines.push('');
  lines.push(t.description);
  lines.push('');
  lines.push(`**Network:** ${network}${network === 'mainnet' ? ' — ⚠️ real value at risk' : ' (testnet)'}`);
  if (adiName) lines.push(`**ADI:** acc://${adiName}.acme`);
  lines.push(`**Difficulty:** ${t.category} · **Typical time:** ${t.estimatedTime}`);
  lines.push('');

  if (t.prerequisites.length) {
    lines.push('## Prerequisites');
    for (const p of t.prerequisites) lines.push(`- ${p}`);
    lines.push('');
  }

  lines.push('## Steps');
  t.instructions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('');

  lines.push('## Rules that must hold');
  lines.push('- **1 ACME = 1e8 base units.** Use the SDK\'s `Amount` helper; never pass whole ACME.');
  lines.push('- **Credits before signing.** An ADI key page must hold credits before it can sign. Buying those credits is itself signed by the lite identity, which already has them.');
  lines.push('- **Wait for settlement.** Faucet deposits and credit purchases are delivered asynchronously. Poll until the balance reflects rather than proceeding immediately.');
  lines.push('- **Verify on chain.** Confirm each step with a query before moving to the next.');
  lines.push('');

  lines.push('## Suggested tools');
  lines.push('- `tx.validate_prereqs` before every `tx.submit` — it catches the missing-credits and missing-principal cases up front.');
  lines.push('- `tx.estimate_credits` to size a credit purchase.');
  lines.push('- `acc.query` / `acc.get_balance` to confirm effects.');
  lines.push('');
  lines.push('Background reading: `accumulate://concepts/credits`, `accumulate://concepts/amount-scaling`.');

  if (requiresSubmit(t) && mode !== PermissionMode.SIGN_AND_SUBMIT) {
    lines.push('');
    lines.push('## ⚠️ Permission mode');
    lines.push(
      `This server is running in **${mode}**, so \`tx.submit\` and \`tx.wait\` will be refused. ` +
        `You can build and validate every transaction in this workflow, but completing it requires ` +
        `restarting the server with \`--permission-mode SIGN_AND_SUBMIT\` (or ` +
        `\`ACCUMULATE_MCP_PERMISSION=SIGN_AND_SUBMIT\`). Say so rather than attempting the submit.`,
    );
  }

  return {
    description: `${t.name} (${t.category})`,
    messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
  };
}

export const promptCount = allPrompts.length;
