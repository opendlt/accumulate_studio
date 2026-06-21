import type { Flow } from '@accumulate-studio/types';

/** Download the flow as a .flow.json file (shared by Header save + Ctrl+S). Returns the filename. */
export function downloadFlowAsJson(flow: Flow): string {
  const content = JSON.stringify(flow, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = `${flow.name.toLowerCase().replace(/\s+/g, '_') || 'flow'}.flow.json`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}
