import { describe, expect, it } from 'vitest';
import { usesRemoteBackend } from './index';

describe('platform backend routing', () => {
  it('uses the remote backend only on web', () => {
    expect(usesRemoteBackend('web')).toBe(true);
    expect(usesRemoteBackend('android')).toBe(false);
    expect(usesRemoteBackend('pywebview')).toBe(false);
  });
});
