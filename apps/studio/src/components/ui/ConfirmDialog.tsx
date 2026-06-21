import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button uses the destructive variant. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => (
  <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm z-50',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
        )}
      />
      <Dialog.Content
        className={cn(
          'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-md p-6',
          'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'border border-gray-200 dark:border-gray-700',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'duration-200'
        )}
        onEscapeKeyDown={onCancel}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description asChild>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                  {description}
                </div>
              </Dialog.Description>
            )}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
