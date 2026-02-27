#!/usr/bin/env node
/**
 * Generate C# template files using Vite's SSR to resolve ?raw imports
 */
import { createServer } from 'vite';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = 'C:/Accumulate_Stuff/on-boarding-platform/temp-download-templates-C_sharp';

async function main() {
  const vite = await createServer({
    root: path.join(__dirname, 'apps/studio'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  try {
    const codeGen = await vite.ssrLoadModule('/src/services/code-generator/index.ts');
    const flowTemplates = await vite.ssrLoadModule('/src/data/flow-templates.ts');

    const templates = flowTemplates.GOLDEN_PATH_TEMPLATES || flowTemplates.FLOW_TEMPLATES || flowTemplates.default;
    if (!templates || !Array.isArray(templates)) {
      console.error('Available exports:', Object.keys(flowTemplates));
      return;
    }

    console.log(`Found ${templates.length} flow templates`);
    mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < templates.length; i++) {
      const tmpl = templates[i];
      const flow = tmpl.flow || tmpl;
      const name = flow.name || `template_${i}`;
      console.log(`\nGenerating: ${name}`);

      try {
        const code = codeGen.generateCode(flow, 'csharp', 'sdk');
        const suffix = i === 0 ? '' : ` (${i})`;
        const filename = `accumulate_flow${suffix}.cs`;
        writeFileSync(path.join(outputDir, filename), code, 'utf-8');
        console.log(`  -> ${filename} (${code.length} bytes)`);
      } catch (err) {
        console.error(`  ERROR generating ${name}:`, err.message);
        if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
  } finally {
    await vite.close();
  }
}

main().catch(console.error);
