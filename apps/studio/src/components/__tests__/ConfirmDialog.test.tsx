/**
 * ConfirmDialog Component Tests (P2-3 Part B)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ui/ConfirmDialog';

vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => <svg data-testid="icon-warning" {...props} />,
}));

describe('ConfirmDialog', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog open title="Delete this?" description="This cannot be undone" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('Delete this?')).toBeDefined();
    expect(screen.getByText('This cannot be undone')).toBeDefined();
  });

  it('does not render content when closed', () => {
    render(<ConfirmDialog open={false} title="Hidden title" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Hidden title')).toBeNull();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="X" confirmLabel="Yes, do it" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Yes, do it'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X" cancelLabel="Nope" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Nope'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders the warning icon when destructive', () => {
    render(<ConfirmDialog open title="X" destructive onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('icon-warning')).toBeDefined();
  });

  it('omits the warning icon when not destructive', () => {
    render(<ConfirmDialog open title="X" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('icon-warning')).toBeNull();
  });
});
