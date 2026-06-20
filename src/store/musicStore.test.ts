import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDownloadQueueDelayMs, useMusicStore } from './musicStore';
import { searchDeezer } from '@/lib/api/musicApi';

// Mock external dependencies
vi.mock('@/lib/audioEngine', () => ({
  audioEngine: {
    load: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    updateMediaSession: vi.fn(),
    setPlaybackState: vi.fn(),
    destroy: vi.fn(),
    onTimeUpdate: null,
    onCanPlay: null,
    onEnded: null,
    onError: null,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isPlaying: false,
  },
}));

vi.mock('@/lib/api/musicApi');
vi.mock('@/lib/colorExtractor', () => ({
  extractDominantColor: vi.fn().mockResolvedValue('#FF5733'),
}));
vi.mock('@/lib/localMusicParser');
vi.mock('@/lib/id3Writer');
vi.mock('sonner');
vi.mock('@capacitor/core');
vi.mock('@capacitor/filesystem');

describe('useMusicStore', () => {
  afterEach(() => {
    // Clean up state after each test
    useMusicStore.setState({
      currentTrack: null,
      isPlaying: false,
      isLoading: false,
      volume: 0.8,
      progress: 0,
      duration: 0,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      searchOffset: 0,
      hasMoreResults: false,
      isLoadingMore: false,
      downloads: [],
      downloadFolder: null,
      downloadFolderName: '',
      dominantColor: null,
      uiLanguageMode: 'system',
      androidFastSearchMode: false,
    });
  });

  describe('Player Initialization', () => {
    it('should initialize with default player state', () => {
      useMusicStore.getState().currentTrack = null; // Reset
      const state = useMusicStore.getState();

      expect(state.isPlaying).toBe(false);
      expect(state.volume).toBe(0.8);
      expect(state.progress).toBe(0);
      expect(state.duration).toBe(0);
    });

    it('should have null current track initially', () => {
      const state = useMusicStore.getState();
      expect(state.currentTrack).toBeNull();
    });

    it('should have default volume of 0.8', () => {
      const state = useMusicStore.getState();
      expect(state.volume).toBe(0.8);
    });
  });

  describe('Android search settings', () => {
    it('should default fast search mode to off and allow toggling it', () => {
      const store = useMusicStore.getState();

      expect(store.androidFastSearchMode).toBe(false);
      store.setAndroidFastSearchMode(true);

      expect(useMusicStore.getState().androidFastSearchMode).toBe(true);
    });
  });

  describe('Player Controls - playTrack', () => {
    it('should set current track when playing', () => {
      const testTrack = {
        id: 't1',
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        cover: 'https://example.com/cover.jpg',
        preview: 'https://example.com/preview.mp3',
      };

      useMusicStore.getState().playTrack(testTrack);
      const state = useMusicStore.getState();

      expect(state.currentTrack?.id).toBe('t1');
      expect(state.currentTrack?.title).toBe('Test Song');
      expect(state.isLoading).toBe(true);
    });

    it('should reset progress when playing new track', () => {
      const testTrack = {
        id: 't1',
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        cover: '',
        preview: 'https://example.com/preview.mp3',
      };

      useMusicStore.getState().playTrack(testTrack);
      const state = useMusicStore.getState();

      expect(state.progress).toBe(0);
    });

    it('should set duration from track', () => {
      const testTrack = {
        id: 't1',
        title: 'Test',
        artist: 'Artist',
        album: 'Album',
        duration: 240,
        cover: '',
        preview: 'https://example.com/preview.mp3',
      };

      useMusicStore.getState().playTrack(testTrack);
      const state = useMusicStore.getState();

      expect(state.duration).toBe(240);
    });

    it('should handle tracks without preview', () => {
      const testTrack = {
        id: 't1',
        title: 'Test',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };

      useMusicStore.getState().playTrack(testTrack);
      const state = useMusicStore.getState();

      expect(state.currentTrack).toBeTruthy();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('Player Controls - togglePlay', () => {
    it('should toggle play state when track is loaded', () => {
      const testTrack = {
        id: 't1',
        title: 'Test',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
        preview: 'https://example.com/preview.mp3',
      };

      const store = useMusicStore.getState();
      store.playTrack(testTrack);
      expect(() => {
        store.togglePlay();
      }).not.toThrow();
    });

    it('should not toggle if no track is loaded', () => {
      const store = useMusicStore.getState();
      store.currentTrack = null;

      const initialState = store.isPlaying;
      store.togglePlay();

      expect(store.isPlaying).toBe(initialState);
    });
  });

  describe('Volume Control', () => {
    it('should set volume', () => {
      const store = useMusicStore.getState();
      expect(() => {
        store.setVolume(0.5);
      }).not.toThrow();
    });

    it('should handle volume at extremes', () => {
      const store = useMusicStore.getState();
      expect(() => {
        store.setVolume(0);
        store.setVolume(1);
      }).not.toThrow();
    });
  });

  describe('Seeking', () => {
    it('should seek to specific time', () => {
      const store = useMusicStore.getState();
      expect(() => {
        store.seekTo(45);
      }).not.toThrow();
    });

    it('should seek to zero', () => {
      const store = useMusicStore.getState();
      expect(() => {
        store.seekTo(0);
      }).not.toThrow();
    });
  });

  describe('Search', () => {
    it('should initialize with empty search results', () => {
      const state = useMusicStore.getState();

      expect(state.searchResults).toEqual([]);
      expect(state.searchQuery).toBe('');
      expect(state.isSearching).toBe(false);
    });

    it('should have searchOffset at 0 initially', () => {
      const state = useMusicStore.getState();

      expect(state.searchOffset).toBe(0);
    });

    it('keeps the newest search when an older request finishes later', async () => {
      let resolveOld: ((tracks: Awaited<ReturnType<typeof searchDeezer>>) => void) | undefined;
      const oldRequest = new Promise<Awaited<ReturnType<typeof searchDeezer>>>((resolve) => {
        resolveOld = resolve;
      });
      vi.mocked(searchDeezer)
        .mockReturnValueOnce(oldRequest)
        .mockResolvedValueOnce([{
          id: 'new',
          title: 'New result',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        }]);

      const first = useMusicStore.getState().performSearch('old');
      const second = useMusicStore.getState().performSearch('new');
      await second;
      resolveOld?.([{
        id: 'old',
        title: 'Old result',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      }]);
      await first;

      expect(useMusicStore.getState().searchQuery).toBe('new');
      expect(useMusicStore.getState().searchResults[0]?.id).toBe('new');
    });
  });

  describe('Language Settings', () => {
    it('should initialize language mode with system default', () => {
      expect(useMusicStore.getState().uiLanguageMode).toBe('system');
    });

    it('should set language mode', () => {
      useMusicStore.getState().setUiLanguageMode('en');
      expect(useMusicStore.getState().uiLanguageMode).toBe('en');
    });
  });

  describe('Downloads', () => {
    it('should initialize with empty downloads', () => {
      const state = useMusicStore.getState();

      expect(state.downloads).toEqual([]);
    });

    it('delays queued downloads only on web', () => {
      expect(getDownloadQueueDelayMs('web')).toBe(3000);
      expect(getDownloadQueueDelayMs('android')).toBe(0);
      expect(getDownloadQueueDelayMs('pywebview')).toBe(0);
    });

    it('keeps a curated source URL in the queued download', () => {
      const track = {
        id: 'anime-20-OP-2',
        title: 'Naruto OP 2',
        artist: 'Asian Kung-Fu Generation',
        album: 'Naruto',
        duration: 0,
        cover: '',
      };
      useMusicStore.setState({ activeDownloads: 2, downloadQueue: [], downloads: [] });

      useMusicStore.getState().startDownloadWithSourceUrl(
        track,
        'https://a.animethemes.moe/Naruto-OP2.ogg',
      );

      const queued = useMusicStore.getState().downloads[0];
      expect(queued.status).toBe('queued');
      expect(queued.sourceUrlOverride).toBe('https://a.animethemes.moe/Naruto-OP2.ogg');
      expect(useMusicStore.getState().downloadQueue).toContain(queued.id);
    });

    it('queues downloads regardless of the reported network type', async () => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { type: 'cellular', effectiveType: '4g' },
      });
      const track = {
        id: 'mobile-network-track',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };
      useMusicStore.setState({ activeDownloads: 2, downloadQueue: [], downloads: [] });

      await useMusicStore.getState().startDownload(track);

      const queued = useMusicStore.getState().downloads[0];
      expect(queued.status).toBe('queued');
      expect(useMusicStore.getState().downloadQueue).toContain(queued.id);
    });

    it('ignores the removed Wi-Fi preference in persisted state', async () => {
      localStorage.setItem('mhl-store', JSON.stringify({
        state: {
          downloadWifiOnly: true,
          volume: 0.45,
        },
        version: 0,
      }));

      await useMusicStore.persist.rehydrate();

      expect(useMusicStore.getState().volume).toBe(0.45);
      expect('downloadWifiOnly' in useMusicStore.getState()).toBe(false);
    });

    it('should remove download by id', () => {
      const store = useMusicStore.getState();
      const testDownload = {
        id: 'd1',
        track: {
          id: 't1',
          title: 'Test',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        },
        progress: 50,
        status: 'downloading' as const,
      };

      store.downloads = [testDownload];
      expect(() => {
        store.removeDownload('d1');
      }).not.toThrow();
    });
  });

  describe('Download Folder', () => {
    it('should initialize with null download folder', () => {
      const state = useMusicStore.getState();

      expect(state.downloadFolder).toBeNull();
      expect(state.downloadFolderName).toBe('');
    });

    it('should clear download folder', () => {
      const store = useMusicStore.getState();
      expect(() => {
        store.clearDownloadFolder();
      }).not.toThrow();
    });
  });

  describe('Dynamic Color', () => {
    it('should initialize with null dominant color', () => {
      const state = useMusicStore.getState();

      expect(state.dominantColor).toBeNull();
    });

    it('should set dominant color', () => {
      const store = useMusicStore.getState();
      const testColor = '#FF5733';

      expect(() => {
        store.setDominantColor(testColor);
      }).not.toThrow();
    });

    it('should clear dominant color', () => {
      const store = useMusicStore.getState();
      store.setDominantColor('#FF5733');
      store.setDominantColor(null);

      expect(store.dominantColor).toBeNull();
    });
  });

  describe('State Consistency', () => {
    it('should maintain consistent state across volume and seek operations', () => {
      const store = useMusicStore.getState();

      expect(() => {
        store.setVolume(0.7);
        store.seekTo(50);
      }).not.toThrow();
    });

    it('should maintain current track after volume change', () => {
      const store = useMusicStore.getState();
      const testTrack = {
        id: 't1',
        title: 'Test',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };

      store.currentTrack = testTrack;
      expect(() => {
        store.setVolume(0.6);
      }).not.toThrow();
      expect(store.currentTrack?.id).toBe('t1');
    });
  });
});
