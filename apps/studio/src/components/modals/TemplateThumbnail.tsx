import React, { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BLOCK_CATALOG, type BlockType, type Flow } from '@accumulate-studio/types';

interface TemplateThumbnailProps {
  flow: Flow;
}

/**
 * Minimal, non-interactive node renderer for thumbnails. Each node is a small
 * rounded rectangle colored by its block type — no labels, no handles.
 */
const ThumbNode: React.FC<{ data: { color: string } }> = ({ data }) => (
  <div
    style={{ backgroundColor: data.color }}
    className="w-10 h-5 rounded-sm border border-black/10 shadow-sm"
  />
);

const thumbNodeTypes = { thumb: ThumbNode };

const TemplateThumbnailInner: React.FC<TemplateThumbnailProps> = ({ flow }) => {
  const nodes: Node[] = useMemo(
    () =>
      flow.nodes.map((n) => {
        const color = BLOCK_CATALOG[n.type as BlockType]?.color ?? '#64748b';
        return {
          id: n.id,
          type: 'thumb',
          position: n.position,
          data: { color },
          draggable: false,
          selectable: false,
          connectable: false,
        };
      }),
    [flow.nodes]
  );

  const edges: Edge[] = useMemo(
    () =>
      flow.connections.map((c) => ({
        id: c.id,
        source: c.sourceNodeId,
        target: c.targetNodeId,
        style: { stroke: '#9ca3af', strokeWidth: 1.5 },
      })),
    [flow.connections]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={thumbNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, minZoom: 0.1, maxZoom: 1.5 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      className="pointer-events-none"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={12}
        size={1}
        color="#e5e7eb"
        className="dark:opacity-20"
      />
    </ReactFlow>
  );
};

/**
 * Renders a template's actual flow as a tiny, decorative mini-graph. Each
 * instance owns its own ReactFlowProvider so multiple thumbnails do not share
 * viewport/zoom state. Colors match the canvas via BLOCK_CATALOG[type].color.
 */
export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ flow }) => (
  <ReactFlowProvider>
    <TemplateThumbnailInner flow={flow} />
  </ReactFlowProvider>
);
