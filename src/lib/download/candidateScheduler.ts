import type { Track } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import { getDownloadCandidates, type CandidateSearchOptions, type DownloadCandidate } from '@/lib/api/musicApi';
import { canRunBackgroundResolution, getDeviceContext, type DeviceContext } from '@/lib/deviceContext';
import type { CellularResolutionPolicy, ResolutionProfile } from '@/store/musicStore';
import type { EditionPreference } from './candidateResolver';

export type ResolutionPriority = 'visible' | 'initial' | 'idle';

export interface CandidateSchedulerSettings {
  profile: ResolutionProfile;
  cellularPolicy: CellularResolutionPolicy;
  editionPreference: EditionPreference;
  animeSearchEnabled: boolean;
}

interface QueueItem {
  key: string;
  track: Track;
  priority: number;
  generation: number;
  onResult: (candidates: DownloadCandidate[]) => void;
}

export class CandidateScheduler {
  private generation = 0;
  private queue: QueueItem[] = [];
  private queued = new Set<string>();
  private active = 0;
  private meteredCount = 0;
  private paused = false;

  constructor(
    private readonly settings: CandidateSchedulerSettings,
    private readonly contextProvider: () => Promise<DeviceContext> = getDeviceContext,
    private readonly resolver = getDownloadCandidates,
    private readonly concurrency = Capacitor.getPlatform() === 'android' ? 1 : 2,
  ) {}

  startSession(): void {
    this.generation += 1;
    this.queue = [];
    this.queued.clear();
    this.meteredCount = 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) void this.drain();
  }

  enqueue(track: Track, priority: ResolutionPriority, onResult: (candidates: DownloadCandidate[]) => void): void {
    const key = String(track.isrc || track.deezerId || track.id);
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.queue.push({
      key, track, generation: this.generation, onResult,
      priority: priority === 'visible' ? 0 : priority === 'initial' ? 1 : 2,
    });
    this.queue.sort((a, b) => a.priority - b.priority);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.paused) return;
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active += 1;
      void this.run(item).finally(() => {
        this.active = Math.max(0, this.active - 1);
        this.queued.delete(item.key);
        void this.drain();
      });
    }
  }

  private async run(item: QueueItem): Promise<void> {
    const context = await this.contextProvider();
    if (item.generation !== this.generation || this.paused || !canRunBackgroundResolution(context)) return;
    if (context.metered) {
      if (this.settings.cellularPolicy === 'off' || this.meteredCount >= 5) return;
      this.meteredCount += 1;
    }
    if (item.priority === 2 && (context.metered || this.settings.profile === 'economy')) return;

    const options: CandidateSearchOptions = {
      depth: 'light',
      editionPreference: this.settings.editionPreference,
    };
    try {
      const candidates = await this.resolver(item.track, this.settings.animeSearchEnabled, options);
      if (item.generation === this.generation && !this.paused) item.onResult(candidates);
    } catch {
      if (item.generation === this.generation && !this.paused) item.onResult([]);
    }
  }
}
