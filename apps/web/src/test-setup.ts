import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(globalThis, "localStorage", {
  value: window.localStorage,
  configurable: true,
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
