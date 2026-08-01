import { GOLDEN_PATH_TEMPLATES } from '../../../apps/studio/src/data/flow-templates';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';
import { writeFileSync } from 'fs';
const OUT = 'C:/Users/jason/AppData/Local/Temp/claude/C--Accumulate-Stuff-on-boarding-platform-accumulate-studio/c4f9e435-9c59-482f-b0c6-5a84db518a94/scratchpad';
const t = (GOLDEN_PATH_TEMPLATES as any[]).find((x) => /key-rotation|rotation/.test(x.id));
console.log('template:', t?.id);
writeFileSync(`${OUT}/rot.csharp.txt`, generateCodeFromManifest(t.flow, 'csharp', 'sdk', loadManifest('csharp')));
