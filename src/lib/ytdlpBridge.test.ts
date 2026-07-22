import { describe, expect, it } from 'vitest';
import { __testing } from './ytdlpBridge';

describe('native search concurrency', () => {
  it('always limits Android candidate resolution to one worker', () => {
    expect(__testing.getNativeSearchConcurrency(8)).toBe(1);
    expect(__testing.getNativeSearchConcurrency(2)).toBe(1);
  });

  it('creates no worker when there are no queries', () => {
    expect(__testing.getNativeSearchConcurrency(0)).toBe(0);
  });
});
