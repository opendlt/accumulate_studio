import { describe, it, expect } from 'vitest';
import { isTypingTarget } from '../keyboard';

describe('isTypingTarget', () => {
  it('is true for input/textarea/select', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isTypingTarget(el)).toBe(true);
  });

  it('is false for non-editable elements and null', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
