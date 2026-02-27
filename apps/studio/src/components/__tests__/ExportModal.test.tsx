/**
 * ExportModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from '../modals/ExportModal';

// Mock stores
vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      flow: {
        name: 'My Flow',
        nodes: [],
        connections: [],
        variables: [],
        assertions: [],
        version: '1.0',
        metadata: {},
      },
    };
    return selector(state);
  }),
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = { selectedNetwork: 'kermit' };
    return selector(state);
  }),
}));

vi.mock('@accumulate-studio/types', () => ({
  SDK_LANGUAGES: ['python', 'rust', 'dart', 'javascript', 'typescript', 'csharp'],
  SDK_DISPLAY_NAMES: {
    python: 'Python',
    rust: 'Rust',
    dart: 'Dart',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    csharp: 'C#',
  },
  SDK_FILE_EXTENSIONS: {
    python: '.py',
    rust: '.rs',
    dart: '.dart',
    javascript: '.js',
    typescript: '.ts',
    csharp: '.cs',
  },
  SDK_PROJECT_FILES: {
    python: 'requirements.txt',
    rust: 'Cargo.toml',
    dart: 'pubspec.yaml',
    javascript: 'package.json',
    typescript: 'package.json',
    csharp: 'project.csproj',
  },
  NETWORKS: {
    kermit: { id: 'kermit', name: 'Kermit (TestNet)', description: 'Test network' },
    mainnet: { id: 'mainnet', name: 'MainNet', description: 'Production' },
    testnet: { id: 'testnet', name: 'TestNet', description: 'Test' },
    devnet: { id: 'devnet', name: 'DevNet', description: 'Dev' },
    local: { id: 'local', name: 'Local DevNet', description: 'Local' },
  },
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
    expect(screen.getByText('Include agent files (prompts & context)')).toBeDefined();
    const checkbox = screen.getByText('Include agent files (prompts & context)')
      .closest('label')
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('renders bundle preview section with file tree', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Bundle Preview')).toBeDefined();
    // The flow name "My Flow" becomes "my_flow_bundle"
    expect(screen.getByText('my_flow_bundle')).toBeDefined();
    expect(screen.getByText('flow.yaml')).toBeDefined();
    expect(screen.getByText('README.md')).toBeDefined();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ExportModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
