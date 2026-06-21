/**
 * CodePanel live-preview tests (P3-4): debounced regeneration off flow edits,
 * immediate regeneration on language/mode switch, the "Updating…" stale badge,
 * and the error / warning surfaces driven by validationResult.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

// generateCode delegate — swap `genImpl` per test (return vs throw).
let genImpl: (flow: any, lang: string, mode: string) => string = (f, l, m) =>
  `// ${l}/${m}/${f.nodes.length}`;
const genSpy = vi.fn((...args: any[]) => genImpl(args[0], args[1], args[2]));
vi.mock('../../services/code-generator', () => ({
  generateCode: (...a: any[]) => genSpy(...a),
}));

// Monaco stand-in renders its value so we can read the code and detect presence.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="monaco">{value}</pre>,
}));

vi.mock('lucide-react', () => ({
  Copy: (p: any) => <svg data-testid="icon-copy" {...p} />,
  Download: (p: any) => <svg data-testid="icon-download" {...p} />,
  Terminal: (p: any) => <svg data-testid="icon-terminal" {...p} />,
  Code2: (p: any) => <svg data-testid="icon-code2" {...p} />,
  AlertCircle: (p: any) => <svg data-testid="icon-alert" {...p} />,
}));

vi.mock('../ui', async (importActual) => {
  const actual = await importActual<typeof import('../ui')>();
  return { ...actual, useToast: () => ({ addToast: vi.fn() }) };
});

// Mutable store state the mocks read each render.
const ui = {
  selectedLanguage: 'python',
  setSelectedLanguage: vi.fn(),
  codeMode: 'sdk',
  setCodeMode: vi.fn(),
  theme: 'dark',
};
let flowState: any;

vi.mock('../../store', () => ({
  useUIStore: (sel: any) => sel(ui),
  useFlowStore: (sel: any) => sel(flowState),
}));

import { CodePanel } from '../code-panel/CodePanel';

function baseFlow(nodes: any[] = [{ id: '1', type: 'GenerateKeys', label: 'Keys' }]) {
  return { nodes, connections: [], variables: [], assertions: [], name: 'T', version: '1.0' };
}

beforeEach(() => {
  vi.useFakeTimers();
  genSpy.mockClear();
  genImpl = (f, l, m) => `// ${l}/${m}/${f.nodes.length}`;
  ui.selectedLanguage = 'python';
  ui.codeMode = 'sdk';
  flowState = { flow: baseFlow(), validationResult: null };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('CodePanel live preview', () => {
  it('generates once on mount with no stale badge', () => {
    render(<CodePanel />);
    expect(genSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Updating/)).toBeNull();
  });

  it('debounces flow edits: shows the badge, regenerates only after the delay', () => {
    const { rerender } = render(<CodePanel />);
    expect(genSpy).toHaveBeenCalledTimes(1);

    // A flow edit (new flow reference) queues a debounced regen.
    flowState = { flow: baseFlow([{ id: '1', type: 'GenerateKeys', label: 'Keys' }, { id: '2', type: 'Faucet' }]), validationResult: null };
    act(() => {
      rerender(<CodePanel />);
    });
    // Badge visible, generation NOT yet re-run.
    expect(screen.getByText(/Updating/)).toBeDefined();
    expect(genSpy).toHaveBeenCalledTimes(1);

    // After the debounce window, exactly one regeneration; badge clears.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(genSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Updating/)).toBeNull();
  });

  it('coalesces rapid edits into a single regeneration', () => {
    const { rerender } = render(<CodePanel />);
    expect(genSpy).toHaveBeenCalledTimes(1);

    for (let i = 2; i <= 6; i++) {
      flowState = {
        flow: baseFlow(Array.from({ length: i }, (_, k) => ({ id: `${k}`, type: 'Faucet' }))),
        validationResult: null,
      };
      act(() => {
        rerender(<CodePanel />);
        vi.advanceTimersByTime(50); // each < 250ms apart
      });
    }
    // No regen yet (each edit reset the timer).
    expect(genSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(genSpy).toHaveBeenCalledTimes(2);
  });

  it('regenerates immediately (no badge) on a language switch', () => {
    const { rerender } = render(<CodePanel />);
    expect(genSpy).toHaveBeenCalledTimes(1);

    ui.selectedLanguage = 'rust';
    act(() => {
      rerender(<CodePanel />);
    });
    // Immediate — no timer advance needed, no stale badge.
    expect(genSpy).toHaveBeenCalledTimes(2);
    expect(genSpy.mock.calls[1][1]).toBe('rust');
    expect(screen.queryByText(/Updating/)).toBeNull();
  });

  it('regenerates immediately on an SDK/CLI mode switch', () => {
    const { rerender } = render(<CodePanel />);
    ui.codeMode = 'cli';
    act(() => {
      rerender(<CodePanel />);
    });
    expect(genSpy).toHaveBeenCalledTimes(2);
    expect(genSpy.mock.calls[1][2]).toBe('cli');
  });
});

describe('CodePanel error & warning surfaces', () => {
  it('renders a friendly error panel (no editor) when generation throws', () => {
    genImpl = () => {
      throw new Error('boom: bad config');
    };
    flowState = {
      flow: baseFlow([{ id: '1', type: 'GenerateKeys', label: 'My Keys' }]),
      validationResult: {
        severity: 'error',
        totalCreditCost: 0,
        analyzedAt: 0,
        nodeResults: {
          '1': { nodeId: '1', nodeType: 'GenerateKeys', severity: 'error', issues: [], creditCost: 0, autoFixRecipe: [] },
        },
      },
    };
    render(<CodePanel />);
    expect(screen.getByText(/Couldn.t generate code/)).toBeDefined();
    expect(screen.getByText(/My Keys/)).toBeDefined();
    expect(screen.getByText(/boom: bad config/)).toBeDefined();
    // Editor must NOT render when in the error state.
    expect(screen.queryByTestId('monaco')).toBeNull();
  });

  it('shows a non-blocking warning banner when validation errors but code still generates', () => {
    flowState = {
      flow: baseFlow([{ id: '1', type: 'GenerateKeys', label: 'My Keys' }]),
      validationResult: {
        severity: 'error',
        totalCreditCost: 0,
        analyzedAt: 0,
        nodeResults: {
          '1': { nodeId: '1', nodeType: 'GenerateKeys', severity: 'error', issues: [], creditCost: 0, autoFixRecipe: [] },
        },
      },
    };
    render(<CodePanel />);
    // Banner present AND the editor still shows code.
    expect(screen.getByText(/need attention/)).toBeDefined();
    expect(screen.getByTestId('monaco')).toBeDefined();
    expect(screen.queryByText(/Couldn.t generate code/)).toBeNull();
  });
});
