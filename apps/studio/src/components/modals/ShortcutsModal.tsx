import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Keyboard } from 'lucide-react';
import { cn } from '../ui';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, 'Z'], label: 'Undo' },
  { keys: [MOD, 'Shift', 'Z'], label: 'Redo' },
  { keys: ['Delete'], label: 'Delete selected block(s)' },
  { keys: [MOD, 'S'], label: 'Save flow to file' },
  { keys: [MOD, 'Enter'], label: 'Execute flow' },
  { keys: [MOD, 'B'], label: 'Toggle Action Palette' },
  { keys: [MOD, 'J'], label: 'Toggle Code Panel' },
  { keys: [MOD, '`'], label: 'Toggle Execution Panel' },
  { keys: ['?'], label: 'Show this cheatsheet' },
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-2 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 min-w-[1.75rem] text-center">
    {children}
  </kbd>
);

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => (
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
          'w-full max-w-md overflow-hidden',
          'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'border border-gray-200 dark:border-gray-700',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'duration-200'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-accumulate-600 dark:text-accumulate-400" />
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Keyboard Shortcuts
            </Dialog.Title>
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
        <Dialog.Description className="sr-only">
          A list of keyboard shortcuts available in Accumulate Studio
        </Dialog.Description>
        <ul className="px-6 py-4 space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Key key={k}>{k}</Key>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
