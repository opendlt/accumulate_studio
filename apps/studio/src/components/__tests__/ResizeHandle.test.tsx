/**
 * ResizeHandle Tests (P2-4) — keyboard-operable panel resize with ARIA.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from '../../App';

describe('ResizeHandle', () => {
  it('exposes separator role, aria values, label, and tabIndex', () => {
    render(
      <ResizeHandle direction="horizontal" onResize={vi.fn()} value={280} min={200} max={600} label="Resize palette" />
    );
    const sep = screen.getByRole('separator');
    expect(sep.getAttribute('aria-valuenow')).toBe('280');
    expect(sep.getAttribute('aria-valuemin')).toBe('200');
    expect(sep.getAttribute('aria-valuemax')).toBe('600');
    expect(sep.getAttribute('aria-label')).toBe('Resize palette');
    expect(sep.getAttribute('tabindex')).toBe('0');
  });

  it('arrow Left/Right resize a horizontal handle by ±16', () => {
    const onResize = vi.fn();
    render(<ResizeHandle direction="horizontal" onResize={onResize} value={280} min={200} max={600} label="x" />);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(16);
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenCalledWith(-16);
  });

  it('Home/End clamp to min/max (delta = bound − value)', () => {
    const onResize = vi.fn();
    render(<ResizeHandle direction="horizontal" onResize={onResize} value={280} min={200} max={600} label="x" />);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'End' });
    expect(onResize).toHaveBeenCalledWith(320); // 600 − 280
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(onResize).toHaveBeenCalledWith(-80); // 200 − 280
  });

  it('a vertical handle uses Up/Down and ignores Left/Right', () => {
    const onResize = vi.fn();
    render(<ResizeHandle direction="vertical" onResize={onResize} value={250} min={100} max={500} label="x" />);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    expect(onResize).toHaveBeenCalledWith(16);
    fireEvent.keyDown(sep, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenCalledWith(-16);
  });

  it('aria-orientation describes the separator line', () => {
    const { rerender } = render(
      <ResizeHandle direction="horizontal" onResize={vi.fn()} value={1} min={0} max={2} label="x" />
    );
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
    rerender(<ResizeHandle direction="vertical" onResize={vi.fn()} value={1} min={0} max={2} label="x" />);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('horizontal');
  });
});
