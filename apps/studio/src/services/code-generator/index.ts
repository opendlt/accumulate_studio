import type { Flow, SDKLanguage } from '@accumulate-studio/types';
import { generateCodeFromManifest, loadAllManifests } from '@accumulate-studio/codegen';

export type CodeMode = 'sdk' | 'cli';

const manifests = loadAllManifests();

export function generateCode(flow: Flow, language: SDKLanguage, mode: CodeMode): string {
  if (flow.nodes.length === 0) {
    return getEmptyFlowMessage(language);
  }

  // All languages now use manifest-driven generation
  if (manifests[language]) {
    return generateCodeFromManifest(flow, language, mode, manifests[language]!);
  }

  // TypeScript shares the JavaScript manifest
  if (language === 'typescript' && manifests['javascript']) {
    return generateCodeFromManifest(flow, 'javascript', mode, manifests['javascript']!);
  }

  return `// Code generation for ${language} not yet implemented`;
}

function getEmptyFlowMessage(language: SDKLanguage): string {
  const comments: Record<SDKLanguage, string> = {
    python: '# ',
    rust: '// ',
    dart: '// ',
    javascript: '// ',
    typescript: '// ',
    csharp: '// ',
  };

  const prefix = comments[language];

  return `${prefix}==========================================
${prefix}Accumulate Studio - Generated Code
${prefix}==========================================
${prefix}
${prefix}Your flow is empty!
${prefix}
${prefix}Drag blocks from the Action Palette on the
${prefix}left to build your Accumulate workflow.
${prefix}
${prefix}Suggested starting points:
${prefix}  1. Generate Keys - Create a new keypair
${prefix}  2. Faucet - Fund your account on testnet
${prefix}  3. Add Credits - Purchase credits for transactions
${prefix}  4. Create ADI - Create your first identity
${prefix}
${prefix}Or try a Golden Path template for a guided
${prefix}walkthrough of common operations.
`;
}
