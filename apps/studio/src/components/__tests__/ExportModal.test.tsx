/**
 * ExportModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from '../modals/ExportModal';

// Mock stores. The flow object is created ONCE in the factory closure so the
// selector returns a stable reference across renders (as the real zustand store
// does) — otherwise the preview effect, which depends on `flow`, would re-run
// every render and loop.
vi.mock('../../store', () => {
  const flow = {
    name: 'My Flow',
    nodes: [],
    connections: [],
    variables: [],
    assertions: [],
    version: '1.0',
    metadata: {},
  };
  return {
    useFlowStore: vi.fn((selector: (s: any) => any) => selector({ flow })),
    useUIStore: vi.fn((selector: (s: any) => any) => selector({ selectedNetwork: 'kermit' })),
  };
});

vi.mock('@accumulate-studio/types', () => ({
  SDK_DISPLAY_NAMES: {
    python: 'Python',
    rust: 'Rust',
    dart: 'Dart',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    csharp: 'C#',
  },
  NETWORKS: {
    kermit: { id: 'kermit', name: 'Kermit (TestNet)', description: 'Test network' },
    mainnet: { id: 'mainnet', name: 'MainNet', description: 'Production' },
    testnet: { id: 'testnet', name: 'TestNet', description: 'Test' },
    devnet: { id: 'devnet', name: 'DevNet', description: 'Dev' },
    local: { id: 'local', name: 'Local DevNet', description: 'Local' },
  },
}));

// Mock the real bundle generator so the preview/export are deterministic.
vi.mock('@accumulate-studio/codegen', () => ({
  generateBundle: vi.fn(async () => ({
    manifest: {},
    files: [
      { path: 'bundle.manifest.json', content: '{}', type: 'manifest' },
      { path: 'flow.yaml', content: 'x', type: 'flow' },
      { path: 'README.md', content: '# x', type: 'readme' },
      { path: 'generated/python/main.py', content: 'print(1)', type: 'code', language: 'python' },
    ],
  })),
}));

vi.mock('../../services/export/bundle-to-zip', () => ({
  bundleToZipBytes: vi.fn(() => new Uint8Array([1, 2, 3])),
  downloadBytes: vi.fn(),
}));

describe('ExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ExportModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders modal title when open', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Export Flow Bundle')).toBeDefined();
  });

  it('renders modal description', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(
      screen.getByText('Export your flow as a multi-language code bundle')
    ).toBeDefined();
  });

  it('renders all language checkboxes', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Python')).toBeDefined();
    expect(screen.getByText('Rust')).toBeDefined();
    expect(screen.getByText('Dart')).toBeDefined();
    expect(screen.getByText('JavaScript')).toBeDefined();
    expect(screen.getByText('C#')).toBeDefined();
  });

  it('has Python selected by default and shows 1 language selected', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('1 language selected')).toBeDefined();
  });

  it('updates language count when toggling languages', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    // Python is already selected (1), click Rust to add it
    fireEvent.click(screen.getByText('Rust'));
    expect(screen.getByText('2 languages selected')).toBeDefined();
    // Click Dart to add it
    fireEvent.click(screen.getByText('Dart'));
    expect(screen.getByText('3 languages selected')).toBeDefined();
  });

  it('disables Export Bundle button when no languages selected', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    // Deselect Python (the only selected language)
    fireEvent.click(screen.getByText('Python'));
    expect(screen.getByText('0 languages selected')).toBeDefined();
    const exportButton = screen.getByText('Export Bundle');
    expect(exportButton.closest('button')?.disabled).toBe(true);
  });

  it('renders network select with options', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Target Network')).toBeDefined();
    // The select should contain all network options
    const select = screen.getByDisplayValue('Kermit (TestNet)');
    expect(select).toBeDefined();
  });

  it('renders Include assertions checkbox checked by default', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Include assertions')).toBeDefined();
    const checkbox = screen.getByText('Include assertions')
      .closest('label')
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders Include agent files checkbox unchecked by default', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Include agent files (task, acceptance, MCP config)')).toBeDefined();
    const checkbox = screen.getByText('Include agent files (task, acceptance, MCP config)')
      .closest('label')
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('renders bundle preview built from the real generator output', async () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Bundle Preview')).toBeDefined();
    // Preview is async (debounced generateBundle dry-run); wait for real paths.
    expect(await screen.findByText('flow.yaml')).toBeDefined();
    expect(await screen.findByText('README.md')).toBeDefined();
    expect(await screen.findByText('generated')).toBeDefined();
    expect(await screen.findByText('main.py')).toBeDefined();
  });

  it('exports a real zip on click', async () => {
    const { generateBundle } = await import('@accumulate-studio/codegen');
    const { bundleToZipBytes, downloadBytes } = await import('../../services/export/bundle-to-zip');
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Export Bundle'));
    // Allow the async handler to run.
    await screen.findByText('Export Flow Bundle');
    await vi.waitFor(() => {
      expect(generateBundle).toHaveBeenCalled();
      expect(bundleToZipBytes).toHaveBeenCalled();
      expect(downloadBytes).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'my_flow_bundle.zip',
      );
    });
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ExportModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
