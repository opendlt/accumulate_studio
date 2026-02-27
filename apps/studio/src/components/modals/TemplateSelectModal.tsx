import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Clock, Star, ChevronRight, Layout, Coins, Database, Zap, GitBranch } from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore } from '../../store';
import { GOLDEN_PATH_TEMPLATES } from '../../data/flow-templates';
import type { FlowTemplate, Flow } from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

interface TemplateSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TemplateCategory = 'all' | 'identity' | 'tokens' | 'data' | 'advanced';
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// Templates are imported from the data layer (real flows with nodes/connections)
const SAMPLE_TEMPLATES: FlowTemplate[] = GOLDEN_PATH_TEMPLATES;

// =============================================================================
// Helper Components
// =============================================================================

interface CategoryIconProps {
  category: TemplateCategory;
  className?: string;
}

const CategoryIcon: React.FC<CategoryIconProps> = ({ category, className }) => {
  switch (category) {
    case 'identity':
      return <Layout className={className} />;
    case 'tokens':
      return <Coins className={className} />;
    case 'data':
      return <Database className={className} />;
    case 'advanced':
      return <Zap className={className} />;
    default:
      return <Star className={className} />;
  }
};

const DifficultyBadge: React.FC<{ level: DifficultyLevel }> = ({ level }) => {
  const colors: Record<DifficultyLevel, string> = {
    beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium capitalize', colors[level])}>
      {level}
    </span>
  );
};

interface TemplateCardProps {
  template: FlowTemplate;
  onSelect: () => void;
  selected: boolean;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onSelect, selected }) => (
  <button
    onClick={onSelect}
    className={cn(
      'w-full text-left p-4 rounded-xl border-2 transition-all',
      'hover:shadow-md',
      selected
        ? 'border-accumulate-500 bg-accumulate-50 dark:bg-accumulate-900/20 shadow-md'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
    )}
  >
    {/* Thumbnail placeholder */}
    <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
      <div className="text-gray-400 dark:text-gray-500">
        <CategoryIcon category={getTemplateCategory(template)} className="w-12 h-12" />
      </div>
    </div>

    {/* Content */}
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
          {template.name}
        </h4>
        <DifficultyBadge level={template.category} />
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
        {template.description}
      </p>

      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {template.estimatedTime}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {template.flow.nodes.length} steps
        </span>
      </div>
    </div>
  </button>
);

// =============================================================================
// Helpers
// =============================================================================

function getTemplateCategory(template: FlowTemplate): TemplateCategory {
  if (template.tags?.includes('identity')) return 'identity';
  if (template.tags?.includes('tokens')) return 'tokens';
  if (template.tags?.includes('data')) return 'data';
  if (template.category === 'advanced') return 'advanced';
  return 'all';
}

function filterTemplates(templates: FlowTemplate[], category: TemplateCategory): FlowTemplate[] {
  if (category === 'all') return templates;
  if (category === 'advanced') {
    return templates.filter((t) => t.category === 'advanced');
  }
  return templates.filter((t) => t.tags?.includes(category));
}

// =============================================================================
// Main Component
// =============================================================================

export const TemplateSelectModal: React.FC<TemplateSelectModalProps> = ({ isOpen, onClose }) => {
  const loadFlow = useFlowStore((state) => state.loadFlow);

  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null);

  // Filter templates by category
  const filteredTemplates = useMemo(
    () => filterTemplates(SAMPLE_TEMPLATES, selectedCategory),
    [selectedCategory]
  );

  // Handle template load
  const handleLoadTemplate = () => {
    if (selectedTemplate) {
      loadFlow(selectedTemplate.flow);
      onClose();
    }
  };

  const categories: { id: TemplateCategory; label: string }[] = [
    { id: 'all', label: 'All Templates' },
    { id: 'identity', label: 'Identity' },
    { id: 'tokens', label: 'Tokens' },
    { id: 'data', label: 'Data' },
    { id: 'advanced', label: 'Advanced' },
  ];

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
            'w-full max-w-4xl max-h-[85vh] overflow-hidden',
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
              <div>
                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Golden Path Templates
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
                  Start with a pre-built flow to learn common Accumulate patterns
                </Dialog.Description>
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
          <div className="flex h-[calc(85vh-180px)]">
            {/* Category Tabs */}
            <Tabs.Root
              value={selectedCategory}
              onValueChange={(value) => {
                setSelectedCategory(value as TemplateCategory);
                setSelectedTemplate(null);
              }}
              className="flex flex-1"
              orientation="vertical"
            >
              <Tabs.List className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 p-2 space-y-1">
                {categories.map((cat) => (
                  <Tabs.Trigger
                    key={cat.id}
                    value={cat.id}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors',
                      selectedCategory === cat.id
                        ? 'bg-accumulate-100 dark:bg-accumulate-900/30 text-accumulate-700 dark:text-accumulate-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    <CategoryIcon category={cat.id} className="w-4 h-4" />
                    {cat.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {/* Template Grid */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-4">
                  {filteredTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      selected={selectedTemplate?.id === template.id}
                      onSelect={() => setSelectedTemplate(template)}
                    />
                  ))}
                </div>
                {filteredTemplates.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                    <Star className="w-12 h-12 mb-3 opacity-50" />
                    <p>No templates in this category</p>
                  </div>
                )}
              </div>
            </Tabs.Root>

            {/* Template Details Sidebar */}
            {selectedTemplate && (
              <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-800/50">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {selectedTemplate.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {selectedTemplate.description}
                </p>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Difficulty
                    </h4>
                    <DifficultyBadge level={selectedTemplate.category} />
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Estimated Time
                    </h4>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {selectedTemplate.estimatedTime}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Flow Info
                    </h4>
                    <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      <p>{selectedTemplate.flow.nodes.length} blocks, {selectedTemplate.flow.connections.length} connections</p>
                      {selectedTemplate.flow.variables.length > 0 && (
                        <p>{selectedTemplate.flow.variables.length} variable{selectedTemplate.flow.variables.length !== 1 ? 's' : ''} to configure</p>
                      )}
                    </div>
                  </div>

                  {selectedTemplate.instructions && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Steps
                      </h4>
                      <ol className="space-y-1.5">
                        {selectedTemplate.instructions.map((step, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs flex items-center justify-center">
                              {index + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {selectedTemplate.prerequisites && selectedTemplate.prerequisites.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Prerequisites
                      </h4>
                      <ul className="space-y-1">
                        {selectedTemplate.prerequisites.map((prereq, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                          >
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                            {prereq}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedTemplate.tags && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedTemplate.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleLoadTemplate}
                  disabled={!selectedTemplate}
                >
                  Load Template
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
