import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileArchive, Check, Folder, File, ChevronRight } from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import {
  SDK_LANGUAGES,
  SDK_DISPLAY_NAMES,
  SDK_FILE_EXTENSIONS,
  SDK_PROJECT_FILES,
  type SDKLanguage,
  type NetworkId,
  NETWORKS,
} from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExportOptions {
  languages: SDKLanguage[];
  includeAssertions: boolean;
  includeAgentFiles: boolean;
  network: NetworkId;
}

interface BundleFile {
  path: string;
  type: 'file' | 'folder';
  children?: BundleFile[];
}

// =============================================================================
// Constants
// =============================================================================

const AVAILABLE_LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

const NETWORK_OPTIONS: { id: NetworkId; name: string }[] = [
  { id: 'kermit', name: 'Kermit (TestNet)' },
  { id: 'mainnet', name: 'MainNet' },
  { id: 'local', name: 'Local DevNet' },
];

// =============================================================================
// Helper Components
// =============================================================================

interface LanguageCheckboxProps {
  language: SDKLanguage;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const LanguageCheckbox: React.FC<LanguageCheckboxProps> = ({ language, checked, onChange }) => (
  <label
    className={cn(
      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
      checked
        ? 'border-accumulate-500 bg-accumulate-50 dark:bg-accumulate-900/20'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
    )}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
    <div
      className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
        checked
          ? 'bg-accumulate-500 border-accumulate-500'
          : 'border-gray-300 dark:border-gray-600'
      )}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </div>
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
      {SDK_DISPLAY_NAMES[language]}
    </span>
  </label>
);

interface FileTreeItemProps {
  item: BundleFile;
  depth?: number;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ item, depth = 0 }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800',
          item.type === 'folder' && 'cursor-pointer'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => item.type === 'folder' && setExpanded(!expanded)}
      >
        {item.type === 'folder' ? (
          <>
            <ChevronRight
              className={cn(
                'w-4 h-4 text-gray-400 transition-transform',
                expanded && 'rotate-90'
              )}
            />
            <Folder className="w-4 h-4 text-yellow-500" />
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="w-4 h-4 text-gray-400" />
          </>
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300">{item.path}</span>
      </div>
      {item.type === 'folder' && expanded && item.children && (
        <div>
          {item.children.map((child, index) => (
            <FileTreeItem key={index} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const flow = useFlowStore((state) => state.flow);
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);

  const [options, setOptions] = useState<ExportOptions>({
    languages: ['python'],
    includeAssertions: true,
    includeAgentFiles: false,
    network: selectedNetwork,
  });

  const [isExporting, setIsExporting] = useState(false);

  // Toggle language selection
  const toggleLanguage = (language: SDKLanguage) => {
    setOptions((prev) => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter((l) => l !== language)
        : [...prev.languages, language],
    }));
  };

  // Generate bundle structure preview
  const bundleStructure = useMemo((): BundleFile[] => {
    const flowName = flow.name.toLowerCase().replace(/\s+/g, '_');
    const structure: BundleFile[] = [
      {
        path: `${flowName}_bundle`,
        type: 'folder',
        children: [
          { path: 'flow.yaml', type: 'file' },
          { path: 'README.md', type: 'file' },
        ],
      },
    ];

    const bundleFolder = structure[0];
    if (!bundleFolder.children) return structure;

    // Add language folders
    for (const lang of options.languages) {
      const langFolder: BundleFile = {
        path: lang,
        type: 'folder',
        children: [
          { path: `main${SDK_FILE_EXTENSIONS[lang]}`, type: 'file' },
          { path: SDK_PROJECT_FILES[lang], type: 'file' },
        ],
      };
      bundleFolder.children.push(langFolder);
    }

    // Add assertions if included
    if (options.includeAssertions && flow.assertions && flow.assertions.length > 0) {
      bundleFolder.children.push({
        path: 'assertions',
        type: 'folder',
        children: [
          { path: 'assertions.yaml', type: 'file' },
          { path: 'verify.py', type: 'file' },
        ],
      });
    }

    // Add agent files if included
    if (options.includeAgentFiles) {
      bundleFolder.children.push({
        path: 'agent',
        type: 'folder',
        children: [
          { path: 'prompt.md', type: 'file' },
          { path: 'context.json', type: 'file' },
        ],
      });
    }

    return structure;
  }, [flow, options]);

  // Handle export
  const handleExport = async () => {
    if (options.languages.length === 0) {
      return;
    }

    setIsExporting(true);

    try {
      // In a real implementation, this would call a service to generate the bundle
      // For now, we'll simulate the export
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Create a simple zip file structure (placeholder)
      const flowName = flow.name.toLowerCase().replace(/\s+/g, '_');
      const content = JSON.stringify({
        flow,
        options,
        exportedAt: new Date().toISOString(),
      }, null, 2);

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flowName}_bundle.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 bg-black/50 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-2xl max-h-[85vh] overflow-hidden',
            'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-200'
          )}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accumulate-100 dark:bg-accumulate-900/30 flex items-center justify-center">
                  <FileArchive className="w-5 h-5 text-accumulate-600 dark:text-accumulate-400" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Export Flow Bundle
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
                    Export your flow as a multi-language code bundle
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-180px)]">
            <div className="space-y-6">
              {/* Language Selection */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Select Languages
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <LanguageCheckbox
                      key={lang}
                      language={lang}
                      checked={options.languages.includes(lang)}
                      onChange={() => toggleLanguage(lang)}
                    />
                  ))}
                </div>
                {options.languages.length === 0 && (
                  <p className="mt-2 text-sm text-red-500">
                    Please select at least one language
                  </p>
                )}
              </div>

              {/* Network Selection */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Target Network
                </h3>
                <select
                  value={options.network}
                  onChange={(e) => setOptions((prev) => ({ ...prev, network: e.target.value as NetworkId }))}
                  className={cn(
                    'w-full px-3 py-2 rounded-md border transition-colors',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600',
                    'text-gray-900 dark:text-gray-100',
                    'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
                  )}
                >
                  {NETWORK_OPTIONS.map((net) => (
                    <option key={net.id} value={net.id}>
                      {net.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {NETWORKS[options.network].description}
                </p>
              </div>

              {/* Options */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Options
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.includeAssertions}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, includeAssertions: e.target.checked }))
                      }
                      className={cn(
                        'w-4 h-4 rounded border transition-colors cursor-pointer',
                        'border-gray-300 dark:border-gray-600',
                        'text-accumulate-600 focus:ring-accumulate-500'
                      )}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Include assertions
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.includeAgentFiles}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, includeAgentFiles: e.target.checked }))
                      }
                      className={cn(
                        'w-4 h-4 rounded border transition-colors cursor-pointer',
                        'border-gray-300 dark:border-gray-600',
                        'text-accumulate-600 focus:ring-accumulate-500'
                      )}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Include agent files (prompts & context)
                    </span>
                  </label>
                </div>
              </div>

              {/* Bundle Preview */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Bundle Preview
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 max-h-48 overflow-y-auto">
                  {bundleStructure.map((item, index) => (
                    <FileTreeItem key={index} item={item} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {options.languages.length} language{options.languages.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExport}
                  disabled={options.languages.length === 0 || isExporting}
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export Bundle
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
