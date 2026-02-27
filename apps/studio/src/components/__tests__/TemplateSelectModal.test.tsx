/**
 * TemplateSelectModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateSelectModal } from '../modals/TemplateSelectModal';

// Mock stores
const mockLoadFlow = vi.fn();

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      loadFlow: mockLoadFlow,
    };
    return selector(state);
  }),
}));

describe('TemplateSelectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <TemplateSelectModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders modal title when open', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Golden Path Templates')).toBeDefined();
  });

  it('renders modal description', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    expect(
      screen.getByText('Start with a pre-built flow to learn common Accumulate patterns')
    ).toBeDefined();
  });

  it('renders category tabs', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('All Templates')).toBeDefined();
    expect(screen.getByText('Identity')).toBeDefined();
    expect(screen.getByText('Tokens')).toBeDefined();
    expect(screen.getByText('Data')).toBeDefined();
    expect(screen.getByText('Advanced')).toBeDefined();
  });

  it('renders template cards with real names', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Lite Account Setup')).toBeDefined();
    expect(screen.getByText('Create Your First ADI')).toBeDefined();
    expect(screen.getByText('Zero to Hero')).toBeDefined();
  });

  it('shows template count in footer', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/\d+ templates? available/)).toBeDefined();
  });

  it('shows step counts on template cards', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    // Multiple templates have step counts shown
    const stepLabels = screen.getAllByText(/\d+ steps/);
    expect(stepLabels.length).toBeGreaterThan(0);
  });

  it('shows detail sidebar when template is selected', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    // Should show Flow Info section
    expect(screen.getByText('Flow Info')).toBeDefined();
    expect(screen.getByText(/3 blocks, 2 connections/)).toBeDefined();
  });

  it('shows instructions when template is selected', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    expect(screen.getByText('Steps')).toBeDefined();
    expect(screen.getByText('Generate an Ed25519 keypair')).toBeDefined();
  });

  it('shows prerequisites when template is selected', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    expect(screen.getByText('Prerequisites')).toBeDefined();
    expect(screen.getByText('None - great for beginners!')).toBeDefined();
  });

  it('shows variable count for templates with variables', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Create Your First ADI'));
    expect(screen.getByText(/1 variable to configure/)).toBeDefined();
  });

  it('does not show variable count for templates without variables', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    // No variables text should appear
    expect(screen.queryByText(/variable/)).toBeNull();
  });

  it('Load Template button is disabled without selection', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    const loadButton = screen.getByText('Load Template');
    expect(loadButton.closest('button')?.disabled).toBe(true);
  });

  it('Load Template button is enabled with selection', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    const loadButton = screen.getByText('Load Template');
    expect(loadButton.closest('button')?.disabled).toBe(false);
  });

  it('loads flow and closes modal on Load Template click', () => {
    const onClose = vi.fn();
    render(<TemplateSelectModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Lite Account Setup'));
    fireEvent.click(screen.getByText('Load Template'));
    expect(mockLoadFlow).toHaveBeenCalledTimes(1);
    const loadedFlow = mockLoadFlow.mock.calls[0][0];
    expect(loadedFlow.nodes.length).toBe(3);
    expect(loadedFlow.connections.length).toBe(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters to identity category', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Identity'));
    // Identity templates should be visible
    expect(screen.getByText('Lite Account Setup')).toBeDefined();
    expect(screen.getByText('Create Your First ADI')).toBeDefined();
  });

  it('filters to advanced category', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByText('Multi-Signature Setup')).toBeDefined();
  });

  it('filters to data category', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Data'));
    expect(screen.getByText('Write Data to Chain')).toBeDefined();
  });

  it('shows Cancel button that calls onClose', () => {
    const onClose = vi.fn();
    render(<TemplateSelectModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows difficulty badges', () => {
    render(<TemplateSelectModal isOpen={true} onClose={vi.fn()} />);
    // Should show at least beginner and intermediate badges
    const beginnerBadges = screen.getAllByText('beginner');
    expect(beginnerBadges.length).toBeGreaterThan(0);
  });
});
