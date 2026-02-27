import React, { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Zap,
  ArrowDown,
  UserPlus,
  Book,
  FileKey,
  Wallet,
  Wallet2,
  Database,
  Coins,
  Send,
  BadgePlus,
  Flame,
  CreditCard,
  ArrowRightLeft,
  FileText,
  FileOutput,
  KeyRound,
  Key,
  Lock,
  Shield,
  Droplets,
  Search,
  Clock,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import {
  BLOCK_CATALOG,
  PREREQUISITE_GRAPH,
  type BlockType,
} from '@accumulate-studio/types';

// =============================================================================
// Icon mapping (same as BlockNode/BlockItem)
// =============================================================================

const BLOCK_ICONS: Record<string, LucideIcon> = {
  'user-plus': UserPlus,
  book: Book,
  'file-key': FileKey,
  wallet: Wallet,
  'wallet-minimal': Wallet2,
  database: Database,
  coins: Coins,
  send: Send,
  'badge-plus': BadgePlus,
  flame: Flame,
  'credit-card': CreditCard,
  'arrow-right-left': ArrowRightLeft,
  'file-text': FileText,
  'file-output': FileOutput,
  'key-round': KeyRound,
  key: Key,
  lock: Lock,
  shield: Shield,
  droplets: Droplets,
  search: Search,
  clock: Clock,
  'message-square': MessageSquare,
};

// =============================================================================
// Types
// =============================================================================

interface PrerequisiteAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModalData {
  targetNodeId: string;
  targetBlockType: BlockType;
  recipe: BlockType[];
  targetPosition: { x: number; y: number };
  attachToNodeId: string | null;
  attachmentPosition: { x: number; y: number } | null;
}

// =============================================================================
// Main Component
// =============================================================================

export const PrerequisiteAssistantModal: React.FC<PrerequisiteAssistantModalProps> = ({
  isOpen,
  onClose,
}) => {
  const modalData = useUIStore((state) => state.modalData) as ModalData | null;
  const openModal = useUIStore((state) => state.openModal);
  const insertPrerequisiteChain = useFlowStore((state) => state.insertPrerequisiteChain);
  const addConnection = useFlowStore((state) => state.addConnection);

  const { targetNodeId, targetBlockType, recipe: rawRecipe, targetPosition, attachToNodeId, attachmentPosition } = modalData ?? {
    targetNodeId: '',
    targetBlockType: 'Comment' as BlockType,
    recipe: [] as BlockType[],
    targetPosition: { x: 0, y: 0 },
    attachToNodeId: null,
    attachmentPosition: null,
  };
  const recipe = Array.isArray(rawRecipe) ? rawRecipe : [] as BlockType[];

  const targetBlockDef = BLOCK_CATALOG[targetBlockType];
  const targetRule = PREREQUISITE_GRAPH[targetBlockType];

  // Look up attachment block name for contextual messaging
  const flow = useFlowStore((state) => state.flow);
  const attachBlockName = useMemo(() => {
    if (!attachToNodeId) return null;
    const attachNode = flow.nodes.find((n) => n.id === attachToNodeId);
    if (!attachNode) return null;
    return BLOCK_CATALOG[attachNode.type]?.name ?? attachNode.type;
  }, [attachToNodeId, flow.nodes]);

  // Compute total credit cost of the recipe
  const totalRecipeCost = useMemo(() => {
    let cost = 0;
    for (const step of recipe) {
      const rule = PREREQUISITE_GRAPH[step];
      if (rule) cost += rule.creditCost;
    }
    // Add target block cost
    if (targetRule) cost += targetRule.creditCost;
    return cost;
  }, [recipe, targetRule]);

  const handleAddPrerequisites = () => {
    if (targetNodeId && recipe.length > 0) {
      insertPrerequisiteChain(recipe, targetNodeId, targetPosition, attachToNodeId, attachmentPosition);
    }
    onClose();
  };

  const handleSetupManually = () => {
    // Wire node to attachment even without prereq chain
    if (attachToNodeId && targetNodeId) {
      addConnection(attachToNodeId, 'output', targetNodeId, 'input');
    }
    onClose();
    // Open block config for the dropped node
    if (targetNodeId && targetBlockType) {
      openModal('block-config', { nodeId: targetNodeId, blockType: targetBlockType });
    }
  };

  if (!targetBlockDef) return null;

  const TargetIcon = BLOCK_ICONS[targetBlockDef.icon] || Coins;

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
            'w-full max-w-lg overflow-hidden',
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
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${targetBlockDef.color}20` }}
                >
                  <TargetIcon
                    className="w-5 h-5"
                    style={{ color: targetBlockDef.color }}
                  />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Prerequisites Needed
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
                    {targetBlockDef.name} requires setup steps
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
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Attachment context message */}
            {attachBlockName && (
              <div className="flex items-center gap-2 p-3 bg-accumulate-50 dark:bg-accumulate-900/20 rounded-lg border border-accumulate-200 dark:border-accumulate-800">
                <ArrowDown className="w-4 h-4 text-accumulate-500 flex-shrink-0" />
                <span className="text-sm text-accumulate-700 dark:text-accumulate-300">
                  These steps will be inserted after <strong>{attachBlockName}</strong>
                </span>
              </div>
            )}

            {/* Explanation */}
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {targetRule?.explanation || `${targetBlockDef.name} requires the following setup steps to work correctly.`}
            </p>

            {/* Recipe visualization */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Setup chain ({recipe.length} step{recipe.length !== 1 ? 's' : ''})
              </h3>
              <div className="space-y-1">
                {recipe.map((stepType, index) => {
                  const stepDef = BLOCK_CATALOG[stepType];
                  const stepRule = PREREQUISITE_GRAPH[stepType];
                  if (!stepDef) return null;
                  const StepIcon = BLOCK_ICONS[stepDef.icon] || Coins;

                  return (
                    <React.Fragment key={index}>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accumulate-100 dark:bg-accumulate-900/30 text-accumulate-600 dark:text-accumulate-400 text-xs font-bold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div
                          className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                          style={{ backgroundColor: `${stepDef.color}20` }}
                        >
                          <StepIcon className="w-3.5 h-3.5" style={{ color: stepDef.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {stepDef.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {stepDef.description}
                          </div>
                        </div>
                        {stepRule && stepRule.creditCost > 0 && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            ~{stepRule.creditCost}cr
                          </span>
                        )}
                      </div>
                      {index < recipe.length - 1 && (
                        <div className="flex justify-center">
                          <ArrowDown className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Arrow to target */}
                <div className="flex justify-center">
                  <ArrowDown className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                </div>

                {/* Target block */}
                <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-accumulate-300 dark:border-accumulate-700 bg-accumulate-50/50 dark:bg-accumulate-900/10">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${targetBlockDef.color}20` }}
                  >
                    <TargetIcon className="w-3.5 h-3.5" style={{ color: targetBlockDef.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {targetBlockDef.name}
                    </div>
                    <div className="text-xs text-accumulate-600 dark:text-accumulate-400">
                      Your dropped block
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost estimate */}
            {totalRecipeCost > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Zap className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Estimated total: ~{totalRecipeCost.toLocaleString()} credits
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={handleSetupManually}>
                I&apos;ll set it up myself
              </Button>
              <Button variant="primary" onClick={handleAddPrerequisites}>
                <Zap className="w-4 h-4 mr-2" />
                Add Prerequisites
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
