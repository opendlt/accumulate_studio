import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ReactFlow (used by template thumbnails) measures with ResizeObserver, which
// happy-dom/jsdom do not provide. Stub it so mini-graphs mount in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
