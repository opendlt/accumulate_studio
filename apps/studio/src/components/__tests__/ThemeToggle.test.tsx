/**
 * ThemeToggle Tests (P2-4) — Radix dropdown a11y + keyboard operation.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../layout/Header';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

describe('ThemeToggle', () => {
  it('renders an accessible menu trigger named after the current theme', () => {
    render(<ThemeToggle theme="system" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Theme: System/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('opens and selecting "Dark" calls onChange("dark")', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="system" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Theme:/i }));
    const dark = await screen.findByText('Dark');
    await user.click(dark);
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('opens via keyboard (Enter) showing Light / Dark / System', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle theme="light" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Theme: Light/i });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Light')).toBeDefined();
    expect(screen.getByText('Dark')).toBeDefined();
    expect(screen.getByText('System')).toBeDefined();
  });
});
