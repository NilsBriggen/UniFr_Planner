import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node 24 exposes a disabled global localStorage unless a CLI path is supplied,
// which prevents Vitest's jsdom environment from installing its own Storage.
// Browser behavior is unchanged; tests receive a standards-shaped enumerable store.
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    for (const key of this.values.keys())
      delete (this as Record<string, unknown>)[key];
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
    delete (this as Record<string, unknown>)[key];
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
    Object.defineProperty(this, key, {
      configurable: true,
      enumerable: true,
      get: () => this.values.get(key),
    });
  }
}
const testStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: testStorage,
  configurable: true,
});
Object.defineProperty(window, "localStorage", {
  value: testStorage,
  configurable: true,
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
