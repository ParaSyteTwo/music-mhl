import { afterEach, describe, expect, it } from 'vitest';
import { __testing } from './ytdlpBridge';

const originalHardwareConcurrency = navigator.hardwareConcurrency;
const originalDeviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

function setDeviceProfile(cores: number, memory: number): void {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: cores,
  });
  Object.defineProperty(navigator, 'deviceMemory', {
    configurable: true,
    value: memory,
  });
}

afterEach(() => {
  setDeviceProfile(originalHardwareConcurrency, originalDeviceMemory ?? 4);
});

describe('native search concurrency', () => {
  it('keeps two searches in parallel on modest devices', () => {
    setDeviceProfile(4, 3);
    expect(__testing.getNativeSearchConcurrency(8)).toBe(2);
  });

  it('uses more parallel work on powerful devices without exceeding four', () => {
    setDeviceProfile(12, 8);
    expect(__testing.getNativeSearchConcurrency(8)).toBe(4);
  });

  it('never creates more workers than queries', () => {
    setDeviceProfile(12, 8);
    expect(__testing.getNativeSearchConcurrency(2)).toBe(2);
  });
});
