import React from 'react';
import {
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
import { cn } from '../ui';
import type { BlockDefinition, BlockType } from '@accumulate-studio/types';
import { BLOCK_CATALOG, PREREQUISITE_GRAPH } from '@accumulate-studio/types';
import { useFlowStore, useUIStore } from '../../store';
import { getPrerequisiteRecipe, findBestAttachmentNode } from '../../services/prerequisite-engine';

// Icon mapping
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

interface BlockItemProps {
  block: BlockDefinition;
}

export const BlockItem: React.FC<BlockItemProps> = ({ block }) => {
  const setDragging = useFlowStore((state) => state.setDragging);
  const addNode = useFlowStore((state) => state.addNode);
  const addConnection = useFlowStore((state) => state.addConnection);
  const flow = useFlowStore((state) => state.flow);
  const openModal = useUIStore((state) => state.openModal);
  const Icon = BLOCK_ICONS[block.icon] || Coins;
  const prereqRule = PREREQUISITE_GRAPH[block.type as BlockType];
  const requiresCount = prereqRule?.requires.length ?? 0;
  const didDrag = React.useRef(false);

  const handleDragStart = (e: React.DragEvent) => {
    didDrag.current = true;
    e.dataTransfer.setData('application/accumulate-block', block.type);
    e.dataTransfer.effectAllowed = 'copy';
    setDragging(true, block.type as BlockType);
  };

  const handleDragEnd = () => {
    setDragging(false);
  };

  // Click-to-add: mirror the drag-drop attachment + prerequisite logic so both
  // placement paths produce identical flows. (skip if we just dragged)
  const handleClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    const blockType = block.type as BlockType;
    const VERTICAL_GAP = 160;

    // ---- Smart attachment to tail nodes (mirrors FlowCanvas onDrop Priority 2) ----
    const attachment = findBestAttachmentNode(blockType, flow);

    if (attachment.score > 0 && attachment.attachToNodeId) {
      const attachNode = flow.nodes.find((n) => n.id === attachment.attachToNodeId);
      const attachPosition = attachNode?.position ?? { x: 0, y: 0 };
      const targetPosition = {
        x: attachPosition.x,
        y: attachPosition.y + (attachment.remainingRecipe.length + 1) * VERTICAL_GAP,
      };
      const nodeId = addNode(blockType, targetPosition);

      if (attachment.remainingRecipe.length === 0) {
        addConnection(attachment.attachToNodeId, 'output', nodeId, 'input');
        const blockDef = BLOCK_CATALOG[blockType];
        if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
          openModal('block-config', { nodeId, blockType });
        }
      } else {
        openModal('prerequisite-assistant', {
          targetNodeId: nodeId,
          targetBlockType: blockType,
          recipe: attachment.remainingRecipe,
          targetPosition,
          attachToNodeId: attachment.attachToNodeId,
          attachmentPosition: attachPosition,
        });
      }
      return;
    }

    // ---- No attachment found — fall back (mirrors FlowCanvas onDrop else branch) ----
    const recipe = getPrerequisiteRecipe(blockType, flow);

    // Append below the lowest existing node (or origin for an empty flow).
    const basePosition =
      flow.nodes.length > 0
        ? flow.nodes.reduce((lowest, n) => (n.position.y > lowest.position.y ? n : lowest), flow.nodes[0]).position
        : { x: 0, y: 0 };
    const targetPosition =
      flow.nodes.length > 0
        ? { x: basePosition.x, y: basePosition.y + VERTICAL_GAP }
        : { x: 0, y: 0 };

    const nodeId = addNode(blockType, targetPosition);

    if (recipe.length > 0) {
      openModal('prerequisite-assistant', {
        targetNodeId: nodeId,
        targetBlockType: blockType,
        recipe,
        targetPosition,
        attachToNodeId: null,
        attachmentPosition: null,
      });
    } else {
      const blockDef = BLOCK_CATALOG[blockType];
      if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
        openModal('block-config', { nodeId, blockType });
      }
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg cursor-grab active:cursor-grabbing',
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
        'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm',
        'transition-all duration-150'
      )}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${block.color}20` }}
      >
        <Icon className="w-5 h-5" style={{ color: block.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {block.name}
          </span>
          {requiresCount > 0 && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              {requiresCount} req
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {block.description}
        </div>
      </div>
    </div>
  );
};
