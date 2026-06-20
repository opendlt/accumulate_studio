import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsModal } from '../modals/ShortcutsModal';

describe('ShortcutsModal', () => {
  it('lists core shortcuts', () => {
    render(<ShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Undo')).toBeDefined();
    expect(screen.getByText('Redo')).toBeDefined();
    expect(screen.getByText('Execute flow')).toBeDefined();
    expect(screen.getByText('Delete selected block(s)')).toBeDefined();
    expect(screen.getByText('Save flow to file')).toBeDefined();
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<ShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Keyboard Shortcuts')).toBeNull();
  });
});
