import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn((query: string) => ({
  matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
})) });
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class TestIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [0];
  private active = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.active.add(target);
    queueMicrotask(() => {
      if (this.active.has(target)) this.callback([{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    });
  }
  unobserve(target: Element) { this.active.delete(target); }
  disconnect() { this.active.clear(); }
  takeRecords() { return []; }
}
vi.stubGlobal('ResizeObserver', TestResizeObserver);
vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value() {} });
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
