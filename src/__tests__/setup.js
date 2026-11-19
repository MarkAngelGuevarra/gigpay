import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof Buffer !== 'undefined' && typeof globalThis.Uint8Array !== 'undefined') {
  const NodeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
  if (!(Buffer.alloc(0) instanceof globalThis.Uint8Array)) {
    globalThis.Uint8Array = NodeUint8Array;
  }
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'function') {
  window.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  globalThis.IntersectionObserver = window.IntersectionObserver;
}

afterEach(() => {
  cleanup();
});
