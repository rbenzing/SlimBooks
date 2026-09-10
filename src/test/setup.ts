import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// happy-dom implements no browser dialogs (confirm/alert/prompt block the
// main thread, which makes no sense headless), so code under test that calls
// window.confirm() finds it undefined unless something provides it.
Object.defineProperty(window, 'confirm', {
  writable: true,
  configurable: true,
  value: vi.fn().mockReturnValue(true),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', {
  writable: true,
  configurable: true,
  value: localStorageMock,
});

// Mock fetch globally
global.fetch = vi.fn();
