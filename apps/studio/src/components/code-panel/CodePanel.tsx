import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as Tabs from '@radix-ui/react-tabs';
import { Copy, Download, Terminal, Code2, AlertCircle } from 'lucide-react';
import { cn, Button, useToast } from '../ui';
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

// Debounce window for regenerating code off flow edits (mirrors the store's
// 300ms validation debounce; slightly tighter so code settles first).
const REGEN_DEBOUNCE_MS = 250;

export const CodePanel: React.FC = () => {
  const selectedLanguage = useUIStore((state) => state.selectedLanguage);
  const setSelectedLanguage = useUIStore((state) => state.setSelectedLanguage);
  const codeMode = useUIStore((state) => state.codeMode);
  const setCodeMode = useUIStore((state) => state.setCodeMode);
  const theme = useUIStore((state) => state.theme);
  const flow = useFlowStore((state) => state.flow);
  // P1-4 per-block validation; used to explain generation failures and warn.
  const validationResult = useFlowStore((state) => state.validationResult);
  const { addToast } = useToast();

  // Result of the last code-generation attempt.
  const [genResult, setGenResult] = useState<{ code: string; error: string | null }>({
    code: '',
    error: null,
  });
  // True while a debounced regeneration is queued but not yet applied.
  const [isStale, setIsStale] = useState(false);

  // Safe generator — captures any throw into state instead of crashing the editor.
  const runGeneration = useCallback(() => {
    try {
      const code = generateCode(flow, selectedLanguage, codeMode);
      setGenResult({ code, error: null });
    } catch (err) {
      console.error('Code generation failed:', err);
      setGenResult((prev) => ({
        code: prev.code, // keep last good code out of the editor; error panel takes over
        error: err instanceof Error ? err.message : 'Unknown code generation error',
      }));
    } finally {
      setIsStale(false);
    }
  }, [flow, selectedLanguage, codeMode]);

  // Keep a ref to the latest generator so the debounce timer and the immediate
  // effect always run the freshest closure. This lets the debounce effect key on
  // `flow` ALONE — so language/mode switches do NOT trip the "Updating…" path.
  const runGenerationRef = useRef(runGeneration);
  useEffect(() => {
    runGenerationRef.current = runGeneration;
  }, [runGeneration]);

  // Language / SDK-CLI switches are explicit, infrequent intent → regenerate
  // immediately (no debounce, no stale badge). Intentionally NOT keyed on `flow`.
  useEffect(() => {
    runGenerationRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, codeMode]);

  // Flow edits → debounced regeneration with an "Updating…" badge.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFlowRun = useRef(true);
  useEffect(() => {
    // The mount effect above already generated once; skip the first flow pass.
    if (firstFlowRun.current) {
      firstFlowRun.current = false;
      return;
    }
    setIsStale(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runGenerationRef.current();
    }, REGEN_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flow]);

  // Resolve 'system' against the OS preference; mirrors App.tsx applyTheme().
  const monacoTheme = useMemo(() => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? 'vs-dark' : 'light';
  }, [theme]);

  // Blocks flagged as errors by validation (P1-4) — named in the error/warn UI.
  const problemBlocks = useMemo<string[]>(() => {
    const nodes = validationResult?.nodeResults;
    if (!nodes) return [];
    return Object.values(nodes)
      .filter((r) => r.severity === 'error')
      .map((r) => flow.nodes.find((n) => n.id === r.nodeId)?.label ?? r.nodeId);
  }, [validationResult, flow.nodes]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(genResult.code);
      addToast({ type: 'success', title: 'Copied to clipboard' });
    } catch (err) {
      console.error('Failed to copy:', err);
      addToast({ type: 'error', title: 'Copy failed', description: 'Clipboard access was blocked.' });
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

    const blob = new Blob([genResult.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accumulate_flow.${extensions[selectedLanguage]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Code downloaded', description: a.download });
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Generated Code
            </h2>
            {isStale && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-accumulate-500 animate-pulse" />
                Updating…
              </span>
            )}
          </div>
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

        {/* Code editor (or error panel) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {genResult.error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Couldn&apos;t generate code
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                {problemBlocks.length > 0
                  ? `Check the configuration of: ${problemBlocks.join(', ')}.`
                  : 'One or more blocks are misconfigured. Open a block to fix its settings.'}
              </p>
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 font-mono break-all max-w-xs">
                {genResult.error}
              </p>
            </div>
          ) : (
            <>
              {problemBlocks.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-b border-yellow-200 dark:border-yellow-900/40">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {problemBlocks.length} block{problemBlocks.length !== 1 ? 's' : ''} need attention — generated code may be incomplete.
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  language={MONACO_LANGUAGES[selectedLanguage]}
                  value={genResult.code}
                  theme={monacoTheme}
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
            </>
          )}
        </div>
      </Tabs.Root>

      {/* Footer stats */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{flow.nodes.length} blocks</span>
          <span>{genResult.code.split('\n').length} lines</span>
        </div>
      </div>
    </div>
  );
};
