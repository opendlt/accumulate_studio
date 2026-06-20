import React, { useCallback } from 'react';
import { useUIStore, useFlowStore } from '../../store';
import { BlockConfigModal } from './BlockConfigModal';
import { ExportModal } from './ExportModal';
import { TemplateSelectModal } from './TemplateSelectModal';
import { ExecuteConfirmModal } from './ExecuteConfirmModal';
import { PrerequisiteAssistantModal } from './PrerequisiteAssistantModal';
import { WelcomeModal } from './WelcomeModal';
import { ShortcutsModal } from './ShortcutsModal';
import { executionEngine } from '../../services/execution';

// =============================================================================
// Modal IDs
// =============================================================================

export const MODAL_IDS = {
  BLOCK_CONFIG: 'block-config',
  EXPORT: 'export',
  TEMPLATE_SELECT: 'template-select',
  EXECUTE_CONFIRM: 'execute-confirm',
  PREREQUISITE_ASSISTANT: 'prerequisite-assistant',
  WELCOME: 'welcome',
  SHORTCUTS: 'shortcuts',
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];

// =============================================================================
// Modal Container
// =============================================================================

export const ModalContainer: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const flow = useFlowStore((state) => state.flow);

  // Handle close
  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Handle execution confirm
  const handleExecuteConfirm = useCallback(async () => {
    try {
      await executionEngine.executeFlow(flow);
    } catch (error) {
      console.error('Execution failed:', error);
    }
  }, [flow]);

  return (
    <>
      {/* Block Configuration Modal */}
      <BlockConfigModal
        isOpen={activeModal === MODAL_IDS.BLOCK_CONFIG}
        onClose={handleClose}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={activeModal === MODAL_IDS.EXPORT}
        onClose={handleClose}
      />

      {/* Template Selection Modal */}
      <TemplateSelectModal
        isOpen={activeModal === MODAL_IDS.TEMPLATE_SELECT}
        onClose={handleClose}
      />

      {/* Execute Confirmation Modal */}
      <ExecuteConfirmModal
        isOpen={activeModal === MODAL_IDS.EXECUTE_CONFIRM}
        onClose={handleClose}
        onConfirm={handleExecuteConfirm}
      />

      {/* Prerequisite Assistant Modal */}
      <PrerequisiteAssistantModal
        isOpen={activeModal === MODAL_IDS.PREREQUISITE_ASSISTANT}
        onClose={handleClose}
      />

      {/* Welcome Onboarding Modal */}
      <WelcomeModal
        isOpen={activeModal === MODAL_IDS.WELCOME}
        onClose={handleClose}
      />

      {/* Keyboard Shortcuts Cheatsheet */}
      <ShortcutsModal
        isOpen={activeModal === MODAL_IDS.SHORTCUTS}
        onClose={handleClose}
      />
    </>
  );
};
