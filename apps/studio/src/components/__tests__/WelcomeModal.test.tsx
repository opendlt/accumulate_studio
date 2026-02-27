/**
 * WelcomeModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeModal } from '../modals/WelcomeModal';

// Mock stores — vi.hoisted ensures these are available before the hoisted vi.mock runs
const { mockSetState, mockOpenModal, mockState } = vi.hoisted(() => {
  const mockSetState = vi.fn();
  const mockOpenModal = vi.fn();
  const mockState = { openModal: mockOpenModal };
  return { mockSetState, mockOpenModal, mockState };
});

vi.mock('../../store', () => {
  const useUIStore: any = vi.fn((selector: (s: any) => any) => selector(mockState));
  useUIStore.getState = () => mockState;
  useUIStore.setState = mockSetState;
  return { useUIStore };
});

describe('WelcomeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <WelcomeModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows welcome title on step 0', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    // The title appears in both the sr-only Dialog.Title and the visible h3
    const headings = screen.getAllByText('Welcome to Accumulate Studio');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('shows description text on step 0', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    expect(
      screen.getByText(/visual flow builder for the Accumulate blockchain/)
    ).toBeDefined();
  });

  it('advances to step 1 (Quick Tour) on Next click', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Your Workspace')).toBeDefined();
  });

  it('shows the three workspace area descriptions on step 1', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Action Palette')).toBeDefined();
    expect(screen.getByText('Flow Canvas')).toBeDefined();
    expect(screen.getByText('Code Panel')).toBeDefined();
    expect(screen.getByText('Browse and drag blocks onto the canvas')).toBeDefined();
    expect(screen.getByText('Connect blocks to build transaction flows')).toBeDefined();
    expect(screen.getByText(/generated SDK code in Python, Rust, Dart, JS, C#/)).toBeDefined();
  });

  it('can go back from step 1 to step 0', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Your Workspace')).toBeDefined();
    fireEvent.click(screen.getByText('Back'));
    // The visible h3 "Welcome to Accumulate Studio" re-appears along with the sr-only title
    const headings = screen.getAllByText('Welcome to Accumulate Studio');
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('advances to step 2 (Get Started) on second Next click', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Get Started')).toBeDefined();
  });

  it('shows "Start with a Template" and "Start from Scratch" options', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Start with a Template')).toBeDefined();
    expect(screen.getByText('Start from Scratch')).toBeDefined();
  });

  it('completes onboarding + opens template modal on "Start with a Template"', () => {
    const onClose = vi.fn();
    render(<WelcomeModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start with a Template'));
    expect(mockSetState).toHaveBeenCalledWith({ hasCompletedOnboarding: true });
    expect(mockOpenModal).toHaveBeenCalledWith('template-select');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('completes onboarding + closes on "Start from Scratch"', () => {
    const onClose = vi.fn();
    render(<WelcomeModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start from Scratch'));
    expect(mockSetState).toHaveBeenCalledWith({ hasCompletedOnboarding: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('shows step indicator dots matching current step', () => {
    render(<WelcomeModal isOpen={true} onClose={vi.fn()} />);
    // Step 0: first dot is active
    const dot0 = screen.getByTestId('step-dot-0');
    const dot1 = screen.getByTestId('step-dot-1');
    const dot2 = screen.getByTestId('step-dot-2');
    expect(dot0.getAttribute('aria-current')).toBe('step');
    expect(dot1.getAttribute('aria-current')).toBeNull();
    expect(dot2.getAttribute('aria-current')).toBeNull();

    // Advance to step 1
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('step-dot-0').getAttribute('aria-current')).toBeNull();
    expect(screen.getByTestId('step-dot-1').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('step-dot-2').getAttribute('aria-current')).toBeNull();

    // Advance to step 2
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('step-dot-0').getAttribute('aria-current')).toBeNull();
    expect(screen.getByTestId('step-dot-1').getAttribute('aria-current')).toBeNull();
    expect(screen.getByTestId('step-dot-2').getAttribute('aria-current')).toBe('step');
  });
});
