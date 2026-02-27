import React, { useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, Search, Sparkles } from 'lucide-react';
import { cn } from '../ui';
import { BlockItem } from './BlockItem';
import {
  BLOCK_CATALOG,
  CATEGORY_METADATA,
  getBlocksByCategory,
  type BlockCategory,
} from '@accumulate-studio/types';
import { useUIStore } from '../../store';

const CATEGORIES: BlockCategory[] = [
  'identity',
  'account',
  'token',
  'credit',
  'data',
  'key-management',
  'authority',
  'utility',
];

export const ActionPalette: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['identity', 'utility']);
  const openModal = useUIStore((state) => state.openModal);

  // Filter blocks by search query
  const filteredBlocks = searchQuery
    ? Object.values(BLOCK_CATALOG).filter(
        (block) =>
          block.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          block.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Action Palette
        </h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-9 pr-3 py-2 text-sm rounded-lg',
              'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
              'placeholder:text-gray-400 text-gray-900 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
            )}
          />
        </div>

        {/* Templates button */}
        <button
          onClick={() => openModal('template-select')}
          className={cn(
            'mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
            'bg-gradient-to-r from-accumulate-600 to-accumulate-500',
            'text-white font-medium text-sm',
            'hover:from-accumulate-700 hover:to-accumulate-600',
            'transition-all duration-150'
          )}
        >
          <Sparkles className="w-4 h-4" />
          Golden Path Templates
        </button>
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredBlocks ? (
          // Search results
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              {filteredBlocks.length} result{filteredBlocks.length !== 1 ? 's' : ''}
            </div>
            {filteredBlocks.map((block) => (
              <BlockItem key={block.type} block={block} />
            ))}
            {filteredBlocks.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No blocks found
              </div>
            )}
          </div>
        ) : (
          // Category accordion
          <Accordion.Root
            type="multiple"
            value={expandedCategories}
            onValueChange={setExpandedCategories}
            className="space-y-2"
          >
            {CATEGORIES.map((category) => {
              const meta = CATEGORY_METADATA[category];
              const blocks = getBlocksByCategory(category);

              return (
                <Accordion.Item
                  key={category}
                  value={category}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <Accordion.Header>
                    <Accordion.Trigger
                      className={cn(
                        'flex items-center justify-between w-full px-4 py-3',
                        'text-left text-sm font-medium',
                        'text-gray-900 dark:text-gray-100',
                        'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                        'transition-colors',
                        '[&[data-state=open]>svg]:rotate-180'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span>{meta.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          ({blocks.length})
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 transition-transform duration-200" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                    <div className="p-3 pt-0 space-y-2">
                      {blocks.map((block) => (
                        <BlockItem key={block.type} block={block} />
                      ))}
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        )}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Click to append or drag onto an edge to insert
        </p>
      </div>
    </div>
  );
};
