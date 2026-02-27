/**
 * CodePanel Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CodePanel } from '../code-panel/CodePanel';

// Mock function references declared before vi.mock so they are hoisted correctly
const mockSetLanguage = vi.fn();
const mockSetCodeMode = vi.fn();

// Mock stores
vi.mock('../../store', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      selectedLanguage: 'python',
      setSelectedLanguage: mockSetLanguage,
      codeMode: 'sdk',
      setCodeMode: mockSetCodeMode,
    };
    return selector(state);
  }),
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      flow: { nodes: [{ id: '1', type: 'GenerateKeys' }], connections: [], variables: [], assertions: [], name: 'Test', version: '1.0' },
    };
    return selector(state);
  }),
}));

// Mock code generator
vi.mock('../../services/code-generator', () => ({
  generateCode: vi.fn(() => '# Generated code\nprint("hello")'),
}));

// Mock Monaco editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="monaco-editor">{value}</pre>,
}));

// Mock lucide-react icons to simple elements
vi.mock('lucide-react', () => ({
  Copy: (props: any) => <svg data-testid="icon-copy" {...props} />,
  Download: (props: any) => <svg data-testid="icon-download" {...props} />,
  Terminal: (props: any) => <svg data-testid="icon-terminal" {...props} />,
  Code2: (props: any) => <svg data-testid="icon-code2" {...props} />,
}));

describe('CodePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Generated Code" heading', () => {
    render(<CodePanel />);
    expect(screen.getByText('Generated Code')).toBeDefined();
  });

  it('renders SDK and CLI mode toggle buttons', () => {
    render(<CodePanel />);
    expect(screen.getByText('SDK')).toBeDefined();
    expect(screen.getByText('CLI')).toBeDefined();
  });

  it('renders all visible language tabs (excluding TypeScript)', () => {
    render(<CodePanel />);
    expect(screen.getByText('Python')).toBeDefined();
    expect(screen.getByText('Rust')).toBeDefined();
    expect(screen.getByText('Dart')).toBeDefined();
    expect(screen.getByText('JavaScript')).toBeDefined();
    expect(screen.getByText('C#')).toBeDefined();
  });

  it('does not render a TypeScript tab', () => {
    render(<CodePanel />);
    expect(screen.queryByText('TypeScript')).toBeNull();
  });

  it('renders the Monaco editor with generated code', () => {
    render(<CodePanel />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.textContent).toBe('# Generated code\nprint("hello")');
  });

  it('renders the copy to clipboard button', () => {
    render(<CodePanel />);
    expect(screen.getByTitle('Copy to clipboard')).toBeDefined();
  });

  it('renders the download button', () => {
    render(<CodePanel />);
    expect(screen.getByTitle('Download file')).toBeDefined();
  });

  it('calls setCodeMode with "cli" when CLI button is clicked', () => {
    render(<CodePanel />);
    fireEvent.click(screen.getByText('CLI'));
    expect(mockSetCodeMode).toHaveBeenCalledWith('cli');
  });

  it('calls setCodeMode with "sdk" when SDK button is clicked', () => {
    render(<CodePanel />);
    fireEvent.click(screen.getByText('SDK'));
    expect(mockSetCodeMode).toHaveBeenCalledWith('sdk');
  });

  it('displays the correct block count in the footer', () => {
    render(<CodePanel />);
    // The mock flow has 1 node
    expect(screen.getByText('1 blocks')).toBeDefined();
  });

  it('displays the correct line count in the footer', () => {
    render(<CodePanel />);
    // "# Generated code\nprint("hello")" has 2 lines
    expect(screen.getByText('2 lines')).toBeDefined();
  });

  it('copies generated code to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodePanel />);
    fireEvent.click(screen.getByTitle('Copy to clipboard'));

    expect(writeTextMock).toHaveBeenCalledWith('# Generated code\nprint("hello")');
  });
});
