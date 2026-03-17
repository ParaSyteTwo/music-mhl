import "@testing-library/jest-dom";
import { vi } from 'vitest';

// Mock HTMLMediaElement methods
Object.defineProperty(HTMLAudioElement.prototype, 'play', {
  writable: true,
  value: vi.fn(() => Promise.resolve()),
  configurable: true,
});

Object.defineProperty(HTMLAudioElement.prototype, 'pause', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLAudioElement.prototype, 'load', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLAudioElement.prototype, 'duration', {
  writable: true,
  configurable: true,
  value: 0,
});

Object.defineProperty(HTMLAudioElement.prototype, 'currentTime', {
  writable: true,
  configurable: true,
  value: 0,
});

Object.defineProperty(HTMLAudioElement.prototype, 'paused', {
  writable: true,
  configurable: true,
  value: true,
});

Object.defineProperty(HTMLAudioElement.prototype, 'volume', {
  writable: true,
  configurable: true,
  value: 1,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock MediaSession API
Object.defineProperty(navigator, 'mediaSession', {
  writable: true,
  configurable: true,
  value: {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn(),
  },
});
