import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@/types/music';
import { CandidateScheduler } from './candidateScheduler';
import type { DeviceContext } from '@/lib/deviceContext';

const track = (id: number): Track => ({
  id: String(id), title: `Song ${id}`, artist: 'Artist', album: 'Album', duration: 180, cover: '', edition: 'unknown',
});
const context = (overrides: Partial<DeviceContext> = {}): DeviceContext => ({
  online: true, metered: false, networkType: 'wifi', batteryPercent: 80, charging: false,
  batterySaver: false, availableMemoryMb: 1000, totalMemoryMb: 2000, processors: 4, locale: 'es-ES', ...overrides,
});
const settings = {
  profile: 'adaptive' as const, cellularPolicy: 'light' as const,
  editionPreference: 'catalog' as const, animeSearchEnabled: false,
};

describe('CandidateScheduler', () => {
  it('never exceeds the configured Android-style concurrency', async () => {
    let active = 0;
    let peak = 0;
    const resolver = vi.fn(async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1; return [];
    });
    const scheduler = new CandidateScheduler(settings, async () => context(), resolver, 1);
    scheduler.startSession();
    for (let i = 0; i < 4; i++) scheduler.enqueue(track(i), 'visible', () => {});
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(peak).toBe(1);
  });

  it('limits automatic metered searches to five and uses light depth', async () => {
    const resolver = vi.fn(async () => []);
    const scheduler = new CandidateScheduler(settings, async () => context({ metered: true, networkType: 'cellular' }), resolver, 1);
    scheduler.startSession();
    for (let i = 0; i < 8; i++) scheduler.enqueue(track(i), 'visible', () => {});
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(resolver).toHaveBeenCalledTimes(5);
    expect(resolver.mock.calls[0][2]).toMatchObject({ depth: 'light' });
  });

  it.each([
    { online: false },
    { batterySaver: true },
    { batteryPercent: 10, charging: false },
  ])('pauses unsafe background work: %o', async (override) => {
    const resolver = vi.fn(async () => []);
    const scheduler = new CandidateScheduler(settings, async () => context(override), resolver, 1);
    scheduler.startSession();
    scheduler.enqueue(track(1), 'visible', () => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolver).not.toHaveBeenCalled();
  });

  it('discards responses from a previous query session', async () => {
    let finish!: () => void;
    const resolver = vi.fn(async () => { await new Promise<void>((resolve) => { finish = resolve; }); return []; });
    const onResult = vi.fn();
    const scheduler = new CandidateScheduler(settings, async () => context(), resolver, 1);
    scheduler.startSession();
    scheduler.enqueue(track(1), 'visible', onResult);
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.startSession();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(onResult).not.toHaveBeenCalled();
  });
});
