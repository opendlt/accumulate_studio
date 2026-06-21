/**
 * NetworkSelector Tests (P2-4) — Radix dropdown a11y + keyboard operation.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkSelector } from '../layout/Header';

beforeAll(() => {
  // Radix menus use pointer-capture + scrollIntoView, which happy-dom doesn't implement.
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

describe('NetworkSelector', () => {
  it('renders an accessible menu trigger (aria-haspopup / aria-expanded)', () => {
    render(<NetworkSelector value="kermit" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Network: Kermit/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click and selecting an item calls onChange with its id', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NetworkSelector value="kermit" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Network: Kermit/i }));
    const mainnet = await screen.findByText('MainNet');
    expect(mainnet).toBeDefined();
    await user.click(mainnet);
    expect(onChange).toHaveBeenCalledWith('mainnet');
  });

  it('opens via keyboard (Enter) showing all active networks', async () => {
    const user = userEvent.setup();
    render(<NetworkSelector value="kermit" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Network: Kermit/i });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('MainNet')).toBeDefined();
    expect(screen.getByText('Local DevNet')).toBeDefined();
    expect(screen.getByText('REAL TOKENS')).toBeDefined();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<NetworkSelector value="kermit" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Network: Kermit/i }));
    await screen.findByText('MainNet');
    await user.keyboard('{Escape}');
    expect(screen.queryByText('MainNet')).toBeNull();
  });
});
