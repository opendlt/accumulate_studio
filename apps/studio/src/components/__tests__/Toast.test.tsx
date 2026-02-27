/**
 * Toast Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../ui/Toast';

// Helper component that triggers toasts
function ToastTrigger({ type, title, description, duration }: {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}) {
  const { addToast } = useToast();
  return (
    <button onClick={() => addToast({ type, title, description, duration })}>
      Show Toast
    </button>
  );
}

describe('ToastProvider', () => {
  it('renders children', () => {
    render(
      <ToastProvider>
        <div>App content</div>
      </ToastProvider>
    );
    expect(screen.getByText('App content')).toBeDefined();
  });

  it('shows success toast when triggered', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" title="Operation succeeded" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Operation succeeded')).toBeDefined();
  });

  it('shows error toast with description', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="error" title="Failed" description="Network unavailable" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Failed')).toBeDefined();
    expect(screen.getByText('Network unavailable')).toBeDefined();
  });

  it('shows warning toast', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="warning" title="Low balance" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Low balance')).toBeDefined();
  });

  it('shows info toast', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" title="Template loaded" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Template loaded')).toBeDefined();
  });

  it('shows multiple toasts', () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" title="Toast message" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    fireEvent.click(screen.getByText('Show Toast'));
    fireEvent.click(screen.getByText('Show Toast'));

    const messages = screen.getAllByText('Toast message');
    expect(messages.length).toBe(3);
  });
});

describe('useToast outside provider', () => {
  it('throws error when used outside provider', () => {
    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within a ToastProvider'
    );
  });
});
