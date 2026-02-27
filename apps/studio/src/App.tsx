import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import { cn, ErrorBoundary, ToastProvider, useToast } from './components/ui';
import { Header } from './components/layout/Header';
import { ActionPalette } from './components/palette';
import { FlowCanvas } from './components/flow-builder';
import { CodePanel } from './components/code-panel';
import { ExecutionPanel } from './components/execution';
import { ModalContainer } from './components/modals';
import { useUIStore, useFlowStore } from './store';
import { executionEngine } from './services/execution';
import { networkService } from './services/network';
import { runAssertions, type AssertionResult } from './services/assertion-runner';

// =============================================================================
// Constants
// =============================================================================

const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;
const MIN_EXECUTION_HEIGHT = 100;
const MAX_EXECUTION_HEIGHT = 500;

// =============================================================================
// Resizable Panel Handle
// =============================================================================

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onResize, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPosRef.current;
        startPosRef.current = currentPos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize]
  );

  return (
    <div
      className={cn(
        'flex items-center justify-center transition-colors group',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-accumulate-500/20'
          : 'h-1 cursor-row-resize hover:bg-accumulate-500/20',
        isDragging && 'bg-accumulate-500/30',
        className
      )}
      onMouseDown={handleMouseDown}
    >
      <div
        className={cn(
          'transition-opacity opacity-0 group-hover:opacity-100',
          direction === 'horizontal' ? 'rotate-90' : '',
          isDragging && 'opacity-100'
        )}
      >
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>
    </div>
  );
};

// =============================================================================
// Main App Component
// =============================================================================

// Inner app component that can use useToast (inside ToastProvider)
const AppInner: React.FC = () => {
  // Onboarding
  const hasCompletedOnboarding = useUIStore((s) => s.hasCompletedOnboarding);
  const openModal = useUIStore((s) => s.openModal);

  useEffect(() => {
    if (!hasCompletedOnboarding) {
      openModal('welcome');
    }
  }, [hasCompletedOnboarding, openModal]);

  // UI Store state
  const showPalette = useUIStore((state) => state.showPalette);
  const showCodePanel = useUIStore((state) => state.showCodePanel);
  const showExecutionPanel = useUIStore((state) => state.showExecutionPanel);
  const panelSizes = useUIStore((state) => state.panelSizes);
  const togglePalette = useUIStore((state) => state.togglePalette);
  const toggleCodePanel = useUIStore((state) => state.toggleCodePanel);
  const toggleExecutionPanel = useUIStore((state) => state.toggleExecutionPanel);
  const setPanelSize = useUIStore((state) => state.setPanelSize);
  const theme = useUIStore((state) => state.theme);
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);

  // Toast
  const { addToast } = useToast();

  // Flow store state
  const flow = useFlowStore((state) => state.flow);
  const execution = useFlowStore((state) => state.execution);

  // Assertion state
  const [assertionResults, setAssertionResults] = useState<AssertionResult[] | null>(null);
  const [assertionsRunning, setAssertionsRunning] = useState(false);

  // Track execution status transitions for toast notifications
  const prevExecutionStatus = useRef<string | null>(null);

  useEffect(() => {
    const currentStatus = execution?.status ?? null;
    const prev = prevExecutionStatus.current;

    if (prev !== currentStatus) {
      // Execution just started
      if (currentStatus === 'running' && prev !== 'running') {
        addToast({ type: 'info', title: 'Execution started', description: `Running "${flow.name}"...` });
        setAssertionResults(null);
      }

      // Execution completed successfully
      if (currentStatus === 'completed' && prev === 'running') {
        addToast({ type: 'success', title: 'Execution completed', description: `"${flow.name}" finished successfully` });

        // Run assertions if the flow has any
        if (flow.assertions && flow.assertions.length > 0 && execution) {
          setAssertionsRunning(true);
          runAssertions(flow.assertions, execution, flow.nodes)
            .then((results) => {
              setAssertionResults(results);
              const failCount = results.filter((r) => r.status === 'fail').length;
              const passCount = results.filter((r) => r.status === 'pass').length;
              if (failCount > 0) {
                addToast({ type: 'warning', title: 'Assertions', description: `${passCount} passed, ${failCount} failed` });
              } else if (passCount > 0) {
                addToast({ type: 'success', title: 'Assertions', description: `All ${passCount} assertions passed` });
              }
            })
            .catch(() => {
              addToast({ type: 'error', title: 'Assertions', description: 'Failed to run assertions' });
            })
            .finally(() => setAssertionsRunning(false));
        }
      }

      // Execution failed
      if (currentStatus === 'failed' && prev === 'running') {
        addToast({ type: 'error', title: 'Execution failed', description: 'Check the execution log for details', duration: 6000 });
      }

      prevExecutionStatus.current = currentStatus;
    }
  }, [execution, flow.name, flow.assertions, addToast]);

  // Mainnet warning when switching networks
  const prevNetwork = useRef(selectedNetwork);
  useEffect(() => {
    if (selectedNetwork === 'mainnet' && prevNetwork.current !== 'mainnet') {
      addToast({
        type: 'warning',
        title: 'Mainnet selected',
        description: 'Transactions on mainnet use real ACME tokens and cannot be reversed.',
        duration: 8000,
      });
    }
    prevNetwork.current = selectedNetwork;
  }, [selectedNetwork, addToast]);

  // Execution handlers
  const handleExecuteFlow = useCallback(async () => {
    try {
      await executionEngine.executeFlow(flow);
    } catch (error) {
      console.error('Execution failed:', error);
    }
  }, [flow]);

  const handleStopExecution = useCallback(() => {
    executionEngine.stopExecution();
  }, []);

  // Panel size state
  const [paletteWidth, setPaletteWidth] = useState(panelSizes.palette);
  const [codePanelWidth, setCodePanelWidth] = useState(panelSizes.codePanel);
  const [executionHeight, setExecutionHeight] = useState(panelSizes.executionPanel);

  // Apply theme on mount and changes
  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') applyTheme();
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Connect to selected network on mount and when network changes
  useEffect(() => {
    networkService.connect(selectedNetwork).catch((error) => {
      console.error('Failed to connect to network:', error);
    });
  }, [selectedNetwork]);

  // Sync panel sizes to store when they change
  useEffect(() => {
    setPanelSize('palette', paletteWidth);
  }, [paletteWidth, setPanelSize]);

  useEffect(() => {
    setPanelSize('codePanel', codePanelWidth);
  }, [codePanelWidth, setPanelSize]);

  useEffect(() => {
    setPanelSize('executionPanel', executionHeight);
  }, [executionHeight, setPanelSize]);

  // Resize handlers
  const handlePaletteResize = useCallback((delta: number) => {
    setPaletteWidth((prev) => Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, prev + delta)));
  }, []);

  const handleCodePanelResize = useCallback((delta: number) => {
    setCodePanelWidth((prev) => Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, prev - delta)));
  }, []);

  const handleExecutionResize = useCallback((delta: number) => {
    setExecutionHeight((prev) => Math.min(MAX_EXECUTION_HEIGHT, Math.max(MIN_EXECUTION_HEIGHT, prev - delta)));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B: Toggle palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        togglePalette();
      }
      // Ctrl/Cmd + J: Toggle code panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        toggleCodePanel();
      }
      // Ctrl/Cmd + `: Toggle execution panel
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleExecutionPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePalette, toggleCodePanel, toggleExecutionPanel]);

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
        {/* Header */}
        <Header onTogglePalette={togglePalette} />

        {/* Main content area */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel: Action Palette */}
          {showPalette && (
            <>
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ width: paletteWidth }}
              >
                <ActionPalette />
              </div>
              <ResizeHandle direction="horizontal" onResize={handlePaletteResize} />
            </>
          )}

          {/* Panel toggle button when palette is hidden */}
          {!showPalette && (
            <button
              onClick={togglePalette}
              className={cn(
                'flex-shrink-0 w-8 flex items-center justify-center',
                'bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800',
                'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              )}
              title="Show palette (Ctrl+B)"
            >
              <PanelLeftClose className="w-4 h-4 rotate-180" />
            </button>
          )}

          {/* Center: Flow Canvas and Execution Panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Flow Canvas */}
            <div className="flex-1 relative min-h-0">
              <FlowCanvas />

              {/* Panel toggle buttons overlay */}
              <div className="absolute top-2 left-2 flex gap-2">
                {showPalette && (
                  <button
                    onClick={togglePalette}
                    className={cn(
                      'p-1.5 rounded-lg bg-white dark:bg-gray-800',
                      'border border-gray-200 dark:border-gray-700',
                      'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                      'shadow-sm hover:shadow transition-all'
                    )}
                    title="Hide palette (Ctrl+B)"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="absolute top-2 right-2 flex gap-2">
                {showCodePanel && (
                  <button
                    onClick={toggleCodePanel}
                    className={cn(
                      'p-1.5 rounded-lg bg-white dark:bg-gray-800',
                      'border border-gray-200 dark:border-gray-700',
                      'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                      'shadow-sm hover:shadow transition-all'
                    )}
                    title="Hide code panel (Ctrl+J)"
                  >
                    <PanelRightClose className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Execution panel toggle */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                <button
                  onClick={toggleExecutionPanel}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800',
                    'border border-gray-200 dark:border-gray-700',
                    'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                    'shadow-sm hover:shadow transition-all text-sm'
                  )}
                  title={showExecutionPanel ? 'Hide execution panel (Ctrl+`)' : 'Show execution panel (Ctrl+`)'}
                >
                  {showExecutionPanel ? (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      <span>Hide Execution</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      <span>Show Execution</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Execution Panel */}
            {showExecutionPanel && (
              <>
                <ResizeHandle direction="vertical" onResize={handleExecutionResize} />
                <div
                  className="flex-shrink-0 overflow-hidden"
                  style={{ height: executionHeight }}
                >
                  <ExecutionPanel
                    executionState={execution}
                    assertionResults={assertionResults}
                    assertionsRunning={assertionsRunning}
                    onExecute={handleExecuteFlow}
                    onStop={handleStopExecution}
                  />
                </div>
              </>
            )}
          </div>

          {/* Panel toggle button when code panel is hidden */}
          {!showCodePanel && (
            <button
              onClick={toggleCodePanel}
              className={cn(
                'flex-shrink-0 w-8 flex items-center justify-center',
                'bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800',
                'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              )}
              title="Show code panel (Ctrl+J)"
            >
              <PanelRightClose className="w-4 h-4 rotate-180" />
            </button>
          )}

          {/* Right panel: Code Panel */}
          {showCodePanel && (
            <>
              <ResizeHandle direction="horizontal" onResize={handleCodePanelResize} />
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ width: codePanelWidth }}
              >
                <CodePanel />
              </div>
            </>
          )}
        </div>

        {/* Modal Container */}
        <ModalContainer />
      </div>
    </ReactFlowProvider>
  );
};

// Outer wrapper providing ErrorBoundary and ToastProvider
const App: React.FC = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  </ErrorBoundary>
);

export default App;
