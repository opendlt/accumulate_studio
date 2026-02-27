import React, { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import * as Tabs from '@radix-ui/react-tabs';
import { Copy, Download, Terminal, Code2 } from 'lucide-react';
import { cn, Button } from '../ui';
import { useUIStore, useFlowStore } from '../../store';
import {
  SDK_LANGUAGES,
  SDK_DISPLAY_NAMES,
  type SDKLanguage,
} from '@accumulate-studio/types';
import { generateCode } from '../../services/code-generator';

// Language to Monaco language mapping
const MONACO_LANGUAGES: Record<SDKLanguage, string> = {
  python: 'python',
  rust: 'rust',
  dart: 'dart',
  javascript: 'javascript',
  typescript: 'typescript',
  csharp: 'csharp',
};

export const CodePanel: React.FC = () => {
  const selectedLanguage = useUIStore((state) => state.selectedLanguage);
  const setSelectedLanguage = useUIStore((state) => state.setSelectedLanguage);
  const codeMode = useUIStore((state) => state.codeMode);
  const setCodeMode = useUIStore((state) => state.setCodeMode);
  const flow = useFlowStore((state) => state.flow);

  // Generate code for current flow and language
  const generatedCode = useMemo(() => {
    return generateCode(flow, selectedLanguage, codeMode);
  }, [flow, selectedLanguage, codeMode]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Download as file
  const handleDownload = () => {
    const extensions: Record<SDKLanguage, string> = {
      python: 'py',
      rust: 'rs',
      dart: 'dart',
      javascript: 'js',
      typescript: 'ts',
      csharp: 'cs',
    };

    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accumulate_flow.${extensions[selectedLanguage]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Generated Code
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy to clipboard">
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Download file">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* SDK/CLI toggle */}
        <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button
            onClick={() => setCodeMode('sdk')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              codeMode === 'sdk'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Code2 className="w-4 h-4" />
            SDK
          </button>
          <button
            onClick={() => setCodeMode('cli')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              codeMode === 'cli'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Terminal className="w-4 h-4" />
            CLI
          </button>
        </div>
      </div>

      {/* Language tabs */}
      <Tabs.Root
        value={selectedLanguage}
        onValueChange={(value) => setSelectedLanguage(value as SDKLanguage)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Tabs.List className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {SDK_LANGUAGES.filter((l) => l !== 'typescript').map((language) => (
            <Tabs.Trigger
              key={language}
              value={language}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
                selectedLanguage === language
                  ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              )}
            >
              {SDK_DISPLAY_NAMES[language]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Code editor */}
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={MONACO_LANGUAGES[selectedLanguage]}
            value={generatedCode}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: 'none',
              folding: true,
            }}
          />
        </div>
      </Tabs.Root>

      {/* Footer stats */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{flow.nodes.length} blocks</span>
          <span>{generatedCode.split('\n').length} lines</span>
        </div>
      </div>
    </div>
  );
};
