import { describe, it, expect, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { useMusicStore } from './musicStore';
import { __downloadSliceTesting } from './slices/downloadSlice';
import {
  downloadTrackAudio,
  getDownloadCandidates,
  getDeezerTrackMeta,
  getLyrics,
  invalidateDownloadCandidateCache,
  searchDeezer,
} from '@/lib/api/musicApi';
import {
  addDownloadProgressListener,
  cleanupTempAudioNative,
  downloadAudioToTempNative,
  tagAndSaveM4A,
  type YtDlpProgressEvent,
} from '@/lib/ytdlpBridge';

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
vi.mock('@/lib/ytdlpBridge', () => ({
  downloadAudioToTempNative: vi.fn(),
  cleanupTempAudioNative: vi.fn().mockResolvedValue(undefined),
  tagAndSaveM4A: vi.fn(),
  addDownloadProgressListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}));
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
    delete (window as { pywebview?: unknown }).pywebview;
    __downloadSliceTesting.resetRateLimitCooldown();
    __downloadSliceTesting.setRetryDelayMs(2000);
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    vi.mocked(addDownloadProgressListener).mockResolvedValue({ remove: vi.fn() });
    vi.mocked(cleanupTempAudioNative).mockResolvedValue(undefined);
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
      downloadQueue: [],
      activeDownloads: 0,
      downloadFolder: null,
      downloadFolderName: '',
      dominantColor: null,
      uiLanguageMode: 'system',
      autoCandidateResolution: true,
      resolutionProfile: 'adaptive',
      cellularResolutionPolicy: 'light',
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

  describe('candidate resolution settings', () => {
    it('defaults to adaptive automatic resolution and allows economy mode', () => {
      const store = useMusicStore.getState();

      expect(store.autoCandidateResolution).toBe(true);
      expect(store.resolutionProfile).toBe('adaptive');
      expect(store.cellularResolutionPolicy).toBe('light');
      store.setResolutionProfile('economy');

      expect(useMusicStore.getState().resolutionProfile).toBe('economy');
    });

    it('defaults downloadAudioFormat to m4a and allows switching to mp3', () => {
      const store = useMusicStore.getState();

      expect(store.downloadAudioFormat).toBe('m4a');
      store.setDownloadAudioFormat('mp3');
      expect(useMusicStore.getState().downloadAudioFormat).toBe('mp3');
      store.setDownloadAudioFormat('m4a');
      expect(useMusicStore.getState().downloadAudioFormat).toBe('m4a');
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

    it('sets direct track and clears search correctly', () => {
      const mockTrack = {
        id: 'yt_test1234567',
        title: 'Solo Leveling Rap',
        artist: 'Kronno Zomber',
        album: 'Kronno Zomber',
        duration: 210,
        cover: 'https://i.ytimg.com/vi/test1234567/hqdefault.jpg',
        youtubeId: 'test1234567',
        sourceUrl: 'https://youtu.be/test1234567',
      };

      useMusicStore.getState().setDirectTrack(mockTrack);
      expect(useMusicStore.getState().searchQuery).toBe('Solo Leveling Rap');
      expect(useMusicStore.getState().searchResults).toHaveLength(1);
      expect(useMusicStore.getState().searchResults[0].id).toBe('yt_test1234567');
      expect(useMusicStore.getState().isSearching).toBe(false);

      useMusicStore.getState().clearSearch();
      expect(useMusicStore.getState().searchQuery).toBe('');
      expect(useMusicStore.getState().searchResults).toHaveLength(0);
      expect(useMusicStore.getState().isSearching).toBe(false);
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

    it('manages allowLongAudioDownloads toggle', () => {
      expect(useMusicStore.getState().allowLongAudioDownloads).toBe(false);
      useMusicStore.getState().setAllowLongAudioDownloads(true);
      expect(useMusicStore.getState().allowLongAudioDownloads).toBe(true);
    });
  });

  describe('Downloads', () => {
    it('should initialize with empty downloads', () => {
      const state = useMusicStore.getState();

      expect(state.downloads).toEqual([]);
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

    it('queues a resolved video regardless of the reported network type', async () => {
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

      useMusicStore.getState().startDownloadWithVideoId(track, 'verified-video');

      const queued = useMusicStore.getState().downloads[0];
      expect(queued.status).toBe('queued');
      expect(queued.videoIdOverride).toBe('verified-video');
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

    it('limits concurrent downloads to 2 outside PyWebView and drains queued items on completion', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: 'Pop',
        year: 2024,
        trackNumber: 1,
        trackTotal: 10,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });
      vi.mocked(tagAndSaveM4A).mockResolvedValue('content://media/external/audio/1');

      const pendingResolvers: Array<() => void> = [];
      let peakActive = 0;
      vi.mocked(downloadAudioToTempNative).mockImplementation(
        async (videoId) =>
          await new Promise((resolve) => {
            peakActive = Math.max(peakActive, useMusicStore.getState().activeDownloads);
            pendingResolvers.push(() =>
              resolve({ tempPath: `/cache/ytdlp/${videoId}/audio.m4a`, size: 65536 }),
            );
          }),
      );

      for (let i = 1; i <= 5; i++) {
        useMusicStore.getState().startDownloadWithVideoId(
          {
            id: `pool-non-pw-${i}`,
            title: `Song ${i}`,
            artist: `Artist ${i}`,
            album: 'Album',
            duration: 180,
            cover: 'https://example.com/cover.jpg',
          },
          `vid_${i}`,
        );
      }

      await vi.waitFor(() => {
        expect(pendingResolvers).toHaveLength(2);
      });

      expect(useMusicStore.getState().activeDownloads).toBe(2);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(3);
      expect(peakActive).toBe(2);

      // Complete first batch of 2 -> next 2 should start
      pendingResolvers[0]();
      pendingResolvers[1]();
      await vi.waitFor(() => {
        expect(pendingResolvers).toHaveLength(4);
      });
      expect(useMusicStore.getState().activeDownloads).toBeLessThanOrEqual(2);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(1);
      expect(peakActive).toBe(2);

      // Complete second batch -> 5th item starts
      pendingResolvers[2]();
      pendingResolvers[3]();
      await vi.waitFor(() => {
        expect(pendingResolvers).toHaveLength(5);
      });

      // Complete final item
      pendingResolvers[4]();
      await vi.waitFor(() => {
        const state = useMusicStore.getState();
        expect(state.activeDownloads).toBe(0);
        expect(state.downloadQueue).toHaveLength(0);
        expect(state.downloads.every((d) => d.status === 'completed')).toBe(true);
      });
      expect(peakActive).toBe(2);
    });

    it('limits concurrent downloads to 3 in PyWebView and drains queued items on completion', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: 'Rock',
        year: 2024,
        trackNumber: 1,
        trackTotal: 10,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });

      const pendingResolvers: Array<() => void> = [];
      let peakActive = 0;
      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockImplementation(
          async (videoId: string) =>
            await new Promise((resolve) => {
              peakActive = Math.max(peakActive, useMusicStore.getState().activeDownloads);
              pendingResolvers.push(() =>
                resolve({
                  success: true,
                  temp_path: `C:/Temp/mhl_audio_cache/${videoId}/audio.m4a`,
                  ext: 'm4a',
                  size: 65536,
                }),
              );
            }),
        ),
        tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 65536 }),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      for (let i = 1; i <= 5; i++) {
        useMusicStore.getState().startDownloadWithVideoId(
          {
            id: `pool-pw-${i}`,
            title: `Desktop Song ${i}`,
            artist: `Artist ${i}`,
            album: 'Album',
            duration: 200,
            cover: 'https://example.com/cover.jpg',
          },
          `dvid_${i}`,
        );
      }

      await vi.waitFor(() => {
        expect(pendingResolvers).toHaveLength(3);
      });

      expect(useMusicStore.getState().activeDownloads).toBe(3);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(2);
      expect(peakActive).toBe(3);

      // Finish first 3 -> remaining 2 start
      pendingResolvers[0]();
      pendingResolvers[1]();
      pendingResolvers[2]();
      await vi.waitFor(() => {
        expect(pendingResolvers).toHaveLength(5);
      });
      expect(useMusicStore.getState().downloadQueue).toHaveLength(0);
      expect(peakActive).toBe(3);

      // Finish last 2
      pendingResolvers[3]();
      pendingResolvers[4]();
      await vi.waitFor(() => {
        const state = useMusicStore.getState();
        expect(state.activeDownloads).toBe(0);
        expect(state.downloadQueue).toHaveLength(0);
        expect(state.downloads.every((d) => d.status === 'completed')).toBe(true);
      });
      expect(peakActive).toBe(3);
    });

    it('uses Zero-Base64 temp_path in PyWebView and cleans up temp_path on pre-tagging error', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Album Artist',
        composer: 'Composer',
        genre: 'Electronic',
        year: 2025,
        trackNumber: 2,
        trackTotal: 12,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: '[00:01.00]Hello', plain: 'Hello' });

      const tempPath = 'C:/Temp/mhl_audio_cache/job1/audio.m4a';
      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockResolvedValue({
          success: true,
          temp_path: tempPath,
          ext: 'm4a',
          size: 123456,
        }),
        tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 123456 }),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'desktop-zero-b64',
          title: 'Zero B64 Track',
          artist: 'Synth Artist',
          album: 'Synth Album',
          duration: 210,
          cover: 'https://example.com/cover.jpg',
        },
        'vidZeroB64',
      );

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('completed');
      });

      expect(pyApi.get_raw_audio).toHaveBeenCalledTimes(1);
      expect(pyApi.get_raw_audio.mock.calls[0][7]).toBe(true);
      expect(pyApi.tag_and_save_m4a).toHaveBeenCalledTimes(1);
      const tagArgs = pyApi.tag_and_save_m4a.mock.calls[0];
      expect(tagArgs).toHaveLength(16);
      expect(tagArgs[1]).toBeNull(); // audio_b64 is null when temp_path is used
      expect(tagArgs[15]).toBe(tempPath); // 16th arg is temp_path
      expect(pyApi.cleanup_temp_audio).not.toHaveBeenCalled();

      // Error prior to tag_and_save_m4a must invoke cleanup_temp_audio
      const leakedTempPath = 'C:/Temp/mhl_audio_cache/job2/audio.m4a';
      pyApi.get_raw_audio.mockResolvedValueOnce({
        success: true,
        temp_path: leakedTempPath,
        ext: 'm4a',
        size: 65536,
      });
      pyApi.get_settings.mockRejectedValueOnce(new Error('settings read failed'));
      pyApi.tag_and_save_m4a.mockClear();

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'desktop-zero-b64-fail',
          title: 'Fail Before Tag',
          artist: 'Synth Artist',
          album: 'Synth Album',
          duration: 210,
          cover: 'https://example.com/cover.jpg',
        },
        'vidZeroB64Fail',
      );

      await vi.waitFor(() => {
        const failed = useMusicStore.getState().downloads.find((d) => d.track.id === 'desktop-zero-b64-fail');
        expect(failed?.status).toBe('error');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });

      expect(pyApi.tag_and_save_m4a).not.toHaveBeenCalled();
      expect(pyApi.cleanup_temp_audio).toHaveBeenCalledWith(leakedTempPath);

      // Retrocompat: when get_raw_audio returns only data_b64 (without temp_path)
      pyApi.get_raw_audio.mockResolvedValueOnce({
        success: true,
        data_b64: 'QUFB',
        ext: 'm4a',
        size: 3,
      });
      pyApi.get_settings.mockResolvedValueOnce({ download_folder: 'C:/Music/MHL' });
      pyApi.tag_and_save_m4a.mockClear();
      pyApi.cleanup_temp_audio.mockClear();

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'desktop-legacy-b64',
          title: 'Legacy B64 Track',
          artist: 'Synth Artist',
          album: 'Synth Album',
          duration: 210,
          cover: 'https://example.com/cover.jpg',
        },
        'vidLegacyB64',
      );

      await vi.waitFor(() => {
        const legacy = useMusicStore.getState().downloads.find((d) => d.track.id === 'desktop-legacy-b64');
        expect(legacy?.status).toBe('completed');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });

      expect(pyApi.tag_and_save_m4a).toHaveBeenCalledTimes(1);
      const legacyTagArgs = pyApi.tag_and_save_m4a.mock.calls[0];
      expect(legacyTagArgs).toHaveLength(16);
      expect(legacyTagArgs[1]).toBe('QUFB');
      expect(legacyTagArgs[15]).toBeNull();
      expect(pyApi.cleanup_temp_audio).not.toHaveBeenCalled();
    });

    it('uses Zero-Base64 tempPath and isolates downloadProgress by downloadId on Android native', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Android Artist',
        composer: null,
        genre: 'Pop',
        year: 2025,
        trackNumber: 3,
        trackTotal: 10,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: '[00:05.00]Line', plain: 'Line' });

      let progressCallback: ((evt: YtDlpProgressEvent) => void) | null = null;
      const removeSpy = vi.fn();
      vi.mocked(addDownloadProgressListener).mockImplementation(async (cb) => {
        progressCallback = cb;
        return { remove: removeSpy };
      });

      let resolveDownload!: (val: { tempPath: string; size: number }) => void;
      vi.mocked(downloadAudioToTempNative).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDownload = resolve;
          }),
      );
      vi.mocked(tagAndSaveM4A).mockResolvedValue('content://media/external/audio/99');

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'android-zero-b64',
          title: 'Native Song',
          artist: 'Android Artist',
          album: 'Native Album',
          duration: 195,
          cover: 'https://example.com/cover.jpg',
        },
        'vidAndroid1',
      );

      await vi.waitFor(() => {
        expect(downloadAudioToTempNative).toHaveBeenCalledTimes(1);
        expect(progressCallback).not.toBeNull();
      });

      const currentDl = useMusicStore.getState().downloads[0];
      expect(downloadAudioToTempNative).toHaveBeenCalledWith(
        'vidAndroid1',
        expect.objectContaining({
          expectedDuration: 195,
          format: 'm4a',
          downloadId: currentDl.id,
        }),
      );

      const progressBeforeForeign = useMusicStore.getState().downloads[0].progress;
      // Foreign downloadId event must be ignored
      progressCallback!({
        progress: 90,
        eta: 1,
        speed: '9.9 MB/s',
        downloadId: 'foreign-download-id',
      });
      expect(useMusicStore.getState().downloads[0].progress).toBe(progressBeforeForeign);
      expect(useMusicStore.getState().downloads[0].speed).toBeUndefined();

      // Matching downloadId event must update progress
      progressCallback!({
        progress: 50,
        eta: 4,
        speed: '2.1 MB/s',
        downloadId: currentDl.id,
      });
      expect(useMusicStore.getState().downloads[0].progress).toBe(53); // 25 + 0.5 * 55 = 52.5 -> 53
      expect(useMusicStore.getState().downloads[0].speed).toBe('2.1 MB/s');
      expect(useMusicStore.getState().downloads[0].eta).toBe(4);

      resolveDownload({
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/task-1/audio.m4a',
        size: 102400,
      });

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('completed');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });

      expect(downloadTrackAudio).not.toHaveBeenCalled();
      expect(tagAndSaveM4A).toHaveBeenCalledTimes(1);
      const tagOptions = vi.mocked(tagAndSaveM4A).mock.calls[0][0];
      expect(tagOptions.tempPath).toBe('/data/user/0/com.mhl.music/cache/ytdlp/task-1/audio.m4a');
      expect(tagOptions.data).toBeUndefined();
      expect(useMusicStore.getState().downloads[0].mediaUri).toBe('content://media/external/audio/99');
      expect(cleanupTempAudioNative).not.toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('cleans up Android tempPath if tagging fails synchronously before taking ownership', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Android Artist',
        composer: null,
        genre: null,
        year: null,
        trackNumber: null,
        trackTotal: null,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });
      vi.mocked(downloadAudioToTempNative).mockResolvedValue({
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/task-err/audio.m4a',
        size: 65536,
      });
      vi.mocked(tagAndSaveM4A).mockImplementationOnce(() => {
        throw new Error('write: bridge unavailable');
      });

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'android-cleanup-err',
          title: 'Cleanup Song',
          artist: 'Android Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        },
        'vidAndroidErr',
      );

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('error');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });

      expect(cleanupTempAudioNative).toHaveBeenCalledWith(
        '/data/user/0/com.mhl.music/cache/ytdlp/task-err/audio.m4a',
      );
    });

    it('retries in Desktop PyWebView and falls back to deep candidate search on unavailable error', async () => {
      __downloadSliceTesting.setRetryDelayMs(5);
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: null,
        year: 2024,
        trackNumber: 1,
        trackTotal: 10,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });
      vi.mocked(getDownloadCandidates).mockResolvedValue([
        {
          videoId: 'vid_alt',
          title: 'Retry Song',
          channel: 'Artist - Topic',
          duration: 180,
          source: 'youtube_music',
          edition: 'unknown',
          verification: 'verified',
          evidence: {
            isrcMatch: false,
            titleMatch: true,
            artistMatch: true,
            albumMatch: false,
            durationDifference: 0,
            official: true,
            youtubeMusicSong: true,
            editionMatch: null,
            contradictions: [],
          },
          rejectionReasons: [],
          score: 800,
          confidence: 'alta',
        },
      ]);

      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi
          .fn()
          .mockResolvedValueOnce({ success: false, error: 'Video unavailable' })
          .mockResolvedValueOnce({
            success: true,
            temp_path: 'C:/Temp/mhl_audio_cache/retry/audio.m4a',
            ext: 'm4a',
            size: 65536,
          }),
        tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 65536 }),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'desktop-retry-fallback',
          title: 'Retry Song',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        },
        'vid_bad',
      );

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('completed');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });

      expect(invalidateDownloadCandidateCache).toHaveBeenCalledTimes(1);
      expect(getDownloadCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'desktop-retry-fallback' }),
        false,
        expect.objectContaining({ depth: 'deep' }),
      );
      expect(pyApi.get_raw_audio).toHaveBeenCalledTimes(2);
      expect(pyApi.get_raw_audio.mock.calls[0][0]).toBe('vid_bad');
      expect(pyApi.get_raw_audio.mock.calls[1][0]).toBe('vid_alt');
    });

    it('blocks duplicate concurrent downloads even when an earlier error record exists for the same track', () => {
      const track = {
        id: 'dup-track-1',
        title: 'Duplicate Guard Track',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
        youtubeId: 'vid_dup',
      };

      useMusicStore.setState({
        activeDownloads: 1,
        downloads: [
          { id: 'err-1', track, progress: 0, status: 'error', error: 'Previous failure' },
          { id: 'dl-2', track, progress: 40, status: 'downloading', videoIdOverride: 'vid_dup' },
        ],
        downloadQueue: [],
      });

      useMusicStore.getState().startDownload(track);
      useMusicStore.getState().startDownloadWithVideoId(track, 'vid_dup');
      useMusicStore.getState().startDownloadWithSourceUrl(track, 'https://example.com/audio.ogg');

      expect(useMusicStore.getState().downloads).toHaveLength(2);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(0);
    });

    it('checks rate-limit cooldown before resolving candidates and does not cascade-drain queued downloads', async () => {
      const track1 = {
        id: 'cooldown-track-1',
        title: 'Cooldown Track 1',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };
      const track2 = {
        id: 'cooldown-track-2',
        title: 'Cooldown Track 2',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };

      __downloadSliceTesting.setRateLimitCooldownUntil(Date.now() + 60_000);
      useMusicStore.setState({
        activeDownloads: 1,
        downloads: [
          { id: 'cd-1', track: track1, progress: 0, status: 'downloading' },
          { id: 'cd-2', track: track2, progress: 0, status: 'queued', videoIdOverride: 'vid_2' },
        ],
        downloadQueue: ['cd-2'],
      });

      await useMusicStore.getState()._executeDownload(track1, 'cd-1');

      expect(getDownloadCandidates).not.toHaveBeenCalled();
      const state = useMusicStore.getState();
      expect(state.downloads.find((d) => d.id === 'cd-1')?.status).toBe('error');
      expect(state.activeDownloads).toBe(0);
      // Queued download must remain queued and NOT be cascade-failed immediately
      expect(state.downloads.find((d) => d.id === 'cd-2')?.status).toBe('queued');
      expect(state.downloadQueue).toEqual(['cd-2']);
    });

    it('activates rate-limit cooldown in Desktop PyWebView on 403 Forbidden without cascading queued items', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: null,
        year: null,
        trackNumber: null,
        trackTotal: null,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });

      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockResolvedValue({
          success: false,
          error: 'HTTP Error 403: Forbidden',
        }),
        tag_and_save_m4a: vi.fn(),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      const track1 = {
        id: 'pw-403-1',
        title: 'Rate Limited Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };
      const track2 = {
        id: 'pw-403-2',
        title: 'Queued After 403',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      };

      useMusicStore.setState({
        activeDownloads: 1,
        downloads: [
          { id: 'pw-dl-1', track: track1, progress: 0, status: 'downloading', videoIdOverride: 'vid_403' },
          { id: 'pw-dl-2', track: track2, progress: 0, status: 'queued', videoIdOverride: 'vid_queued' },
        ],
        downloadQueue: ['pw-dl-2'],
      });

      await useMusicStore.getState()._executeDownload(track1, 'pw-dl-1', 'vid_403');

      expect(pyApi.get_raw_audio).toHaveBeenCalledTimes(1);
      const state = useMusicStore.getState();
      expect(state.downloads.find((d) => d.id === 'pw-dl-1')?.status).toBe('error');
      expect(state.activeDownloads).toBe(0);
      // Cooldown must prevent cascading the queued download immediately
      expect(state.downloads.find((d) => d.id === 'pw-dl-2')?.status).toBe('queued');
      expect(state.downloadQueue).toEqual(['pw-dl-2']);
    });

    it('cleans up temp file when tag_and_save_m4a rejects asynchronously in Desktop PyWebView and ignores negative Android progress', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: null,
        year: null,
        trackNumber: null,
        trackTotal: null,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });

      // 1. Desktop async rejection of tag_and_save_m4a must invoke cleanup_temp_audio
      const desktopTemp = 'C:/Temp/mhl_audio_cache/async_fail/audio.m4a';
      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockResolvedValue({
          success: true,
          temp_path: desktopTemp,
          ext: 'm4a',
          size: 4096,
        }),
        tag_and_save_m4a: vi.fn().mockRejectedValue(new Error('write: disk full')),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'desktop-async-tag-fail',
          title: 'Async Fail',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        },
        'vidAsyncFail',
      );

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('error');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });
      expect(pyApi.cleanup_temp_audio).toHaveBeenCalledWith(desktopTemp);

      // 2. Android async rejection of tagAndSaveM4A cleans up tempPath + negative progress is ignored
      delete (window as { pywebview?: unknown }).pywebview;
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

      let progressCb: ((evt: YtDlpProgressEvent) => void) | null = null;
      vi.mocked(addDownloadProgressListener).mockImplementation(async (cb) => {
        progressCb = cb;
        return { remove: vi.fn() };
      });
      let resolveNative!: (v: { tempPath: string; size: number }) => void;
      vi.mocked(downloadAudioToTempNative).mockImplementation(
        () => new Promise((resolve) => { resolveNative = resolve; }),
      );
      vi.mocked(tagAndSaveM4A).mockRejectedValueOnce(new Error('write: MediaStore error'));

      useMusicStore.getState().startDownloadWithVideoId(
        {
          id: 'android-async-tag-fail',
          title: 'Native Async Fail',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        },
        'vidNativeAsyncFail',
      );

      await vi.waitFor(() => {
        expect(progressCb).not.toBeNull();
      });

      const dl = useMusicStore.getState().downloads.find((d) => d.track.id === 'android-async-tag-fail')!;
      const beforeNeg = dl.progress;
      progressCb!({ progress: -5, eta: -1, speed: '', downloadId: dl.id });
      expect(useMusicStore.getState().downloads.find((d) => d.id === dl.id)?.progress).toBe(beforeNeg);

      resolveNative({
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/async-err/audio.m4a',
        size: 8192,
      });

      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads.find((d) => d.id === dl.id)?.status).toBe('error');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });
      expect(cleanupTempAudioNative).toHaveBeenCalledWith(
        '/data/user/0/com.mhl.music/cache/ytdlp/async-err/audio.m4a',
      );
    });

    it('enqueues a batch of 6 tracks respecting <=2 pool limit outside PyWebView and <=3 inside PyWebView and drains all 6', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Artist',
        composer: null,
        genre: 'Pop',
        year: 2025,
        trackNumber: 1,
        trackTotal: 6,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });
      vi.mocked(tagAndSaveM4A).mockResolvedValue('content://media/external/audio/batch');

      // 1) Outside PyWebView (Android native): pool limit <= 2
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const androidResolvers: Array<() => void> = [];
      let androidPeakActive = 0;
      vi.mocked(downloadAudioToTempNative).mockImplementation(
        async (videoId) =>
          await new Promise((resolve) => {
            androidPeakActive = Math.max(androidPeakActive, useMusicStore.getState().activeDownloads);
            androidResolvers.push(() =>
              resolve({ tempPath: `/cache/ytdlp/${videoId}/audio.m4a`, size: 32768 }),
            );
          }),
      );

      const androidBatch = Array.from({ length: 6 }, (_, idx) => ({
        id: `batch-android-${idx + 1}`,
        title: `Android Batch ${idx + 1}`,
        artist: 'Batch Artist',
        album: 'Batch Album',
        duration: 180,
        cover: '',
        youtubeId: `avid_${idx + 1}`,
      }));

      const androidResult = useMusicStore.getState().startBatchDownload(androidBatch);
      expect(androidResult).toEqual({ queued: 6, skipped: 0, truncated: false });

      await vi.waitFor(() => {
        expect(androidResolvers).toHaveLength(2);
      });
      expect(useMusicStore.getState().activeDownloads).toBe(2);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(4);
      expect(androidPeakActive).toBe(2);

      // Drain 2 at a time
      androidResolvers[0]();
      androidResolvers[1]();
      await vi.waitFor(() => {
        expect(androidResolvers).toHaveLength(4);
      });
      expect(androidPeakActive).toBe(2);

      androidResolvers[2]();
      androidResolvers[3]();
      await vi.waitFor(() => {
        expect(androidResolvers).toHaveLength(6);
      });
      expect(androidPeakActive).toBe(2);

      androidResolvers[4]();
      androidResolvers[5]();
      await vi.waitFor(() => {
        const state = useMusicStore.getState();
        expect(state.activeDownloads).toBe(0);
        expect(state.downloadQueue).toHaveLength(0);
        expect(state.downloads).toHaveLength(6);
        expect(state.downloads.every((d) => d.status === 'completed')).toBe(true);
      });
      expect(androidPeakActive).toBe(2);

      // 2) Inside PyWebView (Desktop): pool limit <= 3
      useMusicStore.setState({ downloads: [], downloadQueue: [], activeDownloads: 0 });
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      const desktopResolvers: Array<() => void> = [];
      let desktopPeakActive = 0;
      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockImplementation(
          async (videoId: string) =>
            await new Promise((resolve) => {
              desktopPeakActive = Math.max(desktopPeakActive, useMusicStore.getState().activeDownloads);
              desktopResolvers.push(() =>
                resolve({
                  success: true,
                  temp_path: `C:/Temp/mhl_audio_cache/${videoId}/audio.m4a`,
                  ext: 'm4a',
                  size: 32768,
                }),
              );
            }),
        ),
        tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 32768 }),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      const desktopBatch = Array.from({ length: 6 }, (_, idx) => ({
        id: `batch-desktop-${idx + 1}`,
        title: `Desktop Batch ${idx + 1}`,
        artist: 'Batch Artist',
        album: 'Batch Album',
        duration: 180,
        cover: '',
        youtubeId: `dvid_${idx + 1}`,
      }));

      const desktopResult = useMusicStore.getState().startBatchDownload(desktopBatch);
      expect(desktopResult).toEqual({ queued: 6, skipped: 0, truncated: false });

      await vi.waitFor(() => {
        expect(desktopResolvers).toHaveLength(3);
      });
      expect(useMusicStore.getState().activeDownloads).toBe(3);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(3);
      expect(desktopPeakActive).toBe(3);

      desktopResolvers[0]();
      desktopResolvers[1]();
      desktopResolvers[2]();
      await vi.waitFor(() => {
        expect(desktopResolvers).toHaveLength(6);
      });
      expect(desktopPeakActive).toBe(3);

      desktopResolvers[3]();
      desktopResolvers[4]();
      desktopResolvers[5]();
      await vi.waitFor(() => {
        const state = useMusicStore.getState();
        expect(state.activeDownloads).toBe(0);
        expect(state.downloadQueue).toHaveLength(0);
        expect(state.downloads).toHaveLength(6);
        expect(state.downloads.every((d) => d.status === 'completed')).toBe(true);
      });
      expect(desktopPeakActive).toBe(3);
    });

    it('deduplicates active downloads and intra-batch duplicates in startBatchDownload', () => {
      const mkTrack = (id: string) => ({
        id,
        title: `Track ${id}`,
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
      });

      const activeTrack = mkTrack('t-active');
      const queuedTrack = mkTrack('t-queued');
      const completedTrack = mkTrack('t-completed');
      const fresh1 = mkTrack('t-fresh-1');
      const fresh2 = mkTrack('t-fresh-2');

      // Block queue execution by filling active slots
      useMusicStore.setState({
        activeDownloads: 2,
        downloads: [
          { id: 'dl-active', track: activeTrack, progress: 50, status: 'downloading' },
          { id: 'dl-queued', track: queuedTrack, progress: 0, status: 'queued' },
          { id: 'dl-completed', track: completedTrack, progress: 100, status: 'completed' },
        ],
        downloadQueue: ['dl-queued'],
      });

      const res = useMusicStore.getState().startBatchDownload([
        activeTrack,      // skipped (downloading)
        queuedTrack,      // skipped (queued)
        completedTrack,   // allowed (completed is not active)
        fresh1,           // queued
        fresh1,           // skipped (intra-batch duplicate)
        fresh2,           // queued
      ]);

      expect(res).toEqual({ queued: 3, skipped: 3, truncated: false });
      expect(useMusicStore.getState().downloads).toHaveLength(6);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(4);
    });

    it('truncates batches larger than 50 tracks to 50 with truncated=true', () => {
      // Block queue execution so items remain inspectable in queued state
      useMusicStore.setState({ activeDownloads: 2, downloads: [], downloadQueue: [] });

      const tracks = Array.from({ length: 65 }, (_, idx) => ({
        id: `big-batch-${idx + 1}`,
        title: `Track ${idx + 1}`,
        artist: 'Artist',
        album: 'Big Album',
        duration: 180,
        cover: '',
      }));

      const res = useMusicStore.getState().startBatchDownload(tracks);

      expect(res).toEqual({ queued: 50, skipped: 0, truncated: true });
      expect(useMusicStore.getState().downloads).toHaveLength(50);
      expect(useMusicStore.getState().downloadQueue).toHaveLength(50);
      expect(useMusicStore.getState().downloads[0].track.id).toBe('big-batch-1');
      expect(useMusicStore.getState().downloads[49].track.id).toBe('big-batch-50');
    });

    it('preserves youtubeId as videoIdOverride and ignores spotify.com in sourceUrlOverride', () => {
      useMusicStore.setState({ activeDownloads: 2, downloads: [], downloadQueue: [] });

      const res = useMusicStore.getState().startBatchDownload([
        {
          id: 'yt-pl-1',
          title: 'YouTube Playlist Track',
          artist: 'YT Artist',
          album: 'YT Playlist',
          duration: 200,
          cover: '',
          youtubeId: 'ytVid123456',
        },
        {
          id: 'sp-pl-1',
          title: 'Spotify Playlist Track',
          artist: 'Spotify Artist',
          album: 'Spotify Playlist',
          duration: 210,
          cover: '',
          sourceUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        },
        {
          id: 'curated-1',
          title: 'Curated Audio Track',
          artist: 'Anime Artist',
          album: 'Anime OST',
          duration: 90,
          cover: '',
          sourceUrl: 'https://a.animethemes.moe/Example-OP1.ogg',
        },
      ]);

      expect(res).toEqual({ queued: 3, skipped: 0, truncated: false });
      const [ytDl, spDl, curatedDl] = useMusicStore.getState().downloads;
      expect(ytDl.videoIdOverride).toBe('ytVid123456');
      expect(ytDl.sourceUrlOverride).toBeUndefined();
      expect(spDl.videoIdOverride).toBeUndefined();
      expect(spDl.sourceUrlOverride).toBeUndefined();
      expect(curatedDl.videoIdOverride).toBeUndefined();
      expect(curatedDl.sourceUrlOverride).toBe('https://a.animethemes.moe/Example-OP1.ogg');
    });

    it('resolves Deezer album tracks without youtubeId via light->deep fallback cleanly on Desktop and Android', async () => {
      vi.mocked(getDeezerTrackMeta).mockResolvedValue({
        albumArtist: 'Album Artist',
        composer: null,
        genre: 'J-Pop',
        year: 2024,
        trackNumber: 1,
        trackTotal: 10,
        discNumber: 1,
        discTotal: 1,
      });
      vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });

      const deepCandidate = {
        videoId: 'deep_resolved_vid',
        title: 'Album Track',
        channel: 'Album Artist - Topic',
        duration: 210,
        source: 'youtube_music' as const,
        edition: 'unknown' as const,
        verification: 'verified' as const,
        evidence: {
          isrcMatch: false,
          titleMatch: true,
          artistMatch: true,
          albumMatch: true,
          durationDifference: 1,
          official: true,
          youtubeMusicSong: true,
          editionMatch: null,
          contradictions: [],
        },
        rejectionReasons: [],
        score: 850,
        confidence: 'alta' as const,
      };

      // Return empty on light, verified candidate on deep
      vi.mocked(getDownloadCandidates).mockImplementation(async (_track, _anime, opts) => {
        if (opts?.depth === 'deep') return [deepCandidate];
        return [];
      });

      const deezerAlbumTrack = {
        id: 'dz-777001',
        deezerId: 777001,
        albumId: 55500,
        title: 'Album Track',
        artist: 'Album Artist',
        album: 'Full Album',
        duration: 210,
        cover: 'https://cdn.example/cover.jpg',
      };

      // 1) Desktop PyWebView
      const pyApi = {
        get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
        get_raw_audio: vi.fn().mockResolvedValue({
          success: true,
          temp_path: 'C:/Temp/mhl_audio_cache/dz777001/audio.m4a',
          ext: 'm4a',
          size: 65536,
        }),
        tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 65536 }),
        cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
      };
      (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

      useMusicStore.getState().startBatchDownload([deezerAlbumTrack]);
      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('completed');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });
      expect(pyApi.get_raw_audio.mock.calls[0][0]).toBe('deep_resolved_vid');

      // 2) Android Capacitor Native
      delete (window as { pywebview?: unknown }).pywebview;
      useMusicStore.setState({ downloads: [], downloadQueue: [], activeDownloads: 0 });
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(downloadAudioToTempNative).mockResolvedValue({
        tempPath: '/cache/ytdlp/deep_resolved_vid/audio.m4a',
        size: 65536,
      });
      vi.mocked(tagAndSaveM4A).mockResolvedValue('content://media/external/audio/777');

      useMusicStore.getState().startBatchDownload([deezerAlbumTrack]);
      await vi.waitFor(() => {
        expect(useMusicStore.getState().downloads[0]?.status).toBe('completed');
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      });
      expect(downloadAudioToTempNative).toHaveBeenCalledWith(
        'deep_resolved_vid',
        expect.objectContaining({ expectedDuration: 210, format: 'm4a' }),
      );
      expect(useMusicStore.getState().downloads[0]?.videoIdOverride).toBe('deep_resolved_vid');
    });

    it('drops YouTube URLs from sourceUrlOverride in startBatchDownload and prioritizes youtubeId in startDownload', async () => {
      useMusicStore.setState({ activeDownloads: 2, downloads: [], downloadQueue: [] });

      const ytTrackWithUrl = {
        id: 'yt-both-1',
        title: 'YouTube Video With Both Fields',
        artist: 'Artist',
        album: 'Playlist',
        duration: 200,
        cover: '',
        youtubeId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      const batchRes = useMusicStore.getState().startBatchDownload([ytTrackWithUrl]);
      expect(batchRes).toEqual({ queued: 1, skipped: 0, truncated: false });
      expect(useMusicStore.getState().downloads[0]?.videoIdOverride).toBe('dQw4w9WgXcQ');
      expect(useMusicStore.getState().downloads[0]?.sourceUrlOverride).toBeUndefined();

      // Also verify startDownload prioritizes youtubeId over sourceUrl
      useMusicStore.setState({ activeDownloads: 2, downloads: [], downloadQueue: [] });
      await useMusicStore.getState().startDownload(ytTrackWithUrl);
      expect(useMusicStore.getState().downloads[0]?.videoIdOverride).toBe('dQw4w9WgXcQ');
      expect(useMusicStore.getState().downloads[0]?.sourceUrlOverride).toBeUndefined();
    });

    it('automatically resumes downloadQueue when rateLimitCooldownUntil expires', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(getDeezerTrackMeta).mockResolvedValue({
          albumArtist: 'Artist',
          composer: null,
          genre: null,
          year: null,
          trackNumber: null,
          trackTotal: null,
          discNumber: 1,
          discTotal: 1,
        });
        vi.mocked(getLyrics).mockResolvedValue({ synced: null, plain: null });

        const pyApi = {
          get_settings: vi.fn().mockResolvedValue({ download_folder: 'C:/Music/MHL' }),
          get_raw_audio: vi
            .fn()
            .mockResolvedValueOnce({
              success: false,
              error: 'HTTP Error 403: Forbidden',
            })
            .mockResolvedValueOnce({
              success: true,
              temp_path: 'C:/Temp/mhl_audio_cache/resumed/audio.m4a',
              ext: 'm4a',
              size: 65536,
            }),
          tag_and_save_m4a: vi.fn().mockResolvedValue({ success: true, size: 65536 }),
          cleanup_temp_audio: vi.fn().mockResolvedValue({ success: true }),
        };
        (window as unknown as { pywebview: { api: typeof pyApi } }).pywebview = { api: pyApi };

        const track1 = {
          id: 'cd-resume-1',
          title: 'First 403 Song',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        };
        const track2 = {
          id: 'cd-resume-2',
          title: 'Second Resumed Song',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
        };

        useMusicStore.setState({
          activeDownloads: 1,
          downloads: [
            { id: 'res-dl-1', track: track1, progress: 0, status: 'downloading', videoIdOverride: 'vid_403_r1' },
            { id: 'res-dl-2', track: track2, progress: 0, status: 'queued', videoIdOverride: 'vid_ok_r2' },
          ],
          downloadQueue: ['res-dl-2'],
        });

        await useMusicStore.getState()._executeDownload(track1, 'res-dl-1', 'vid_403_r1');

        expect(useMusicStore.getState().downloads.find((d) => d.id === 'res-dl-1')?.status).toBe('error');
        expect(useMusicStore.getState().downloads.find((d) => d.id === 'res-dl-2')?.status).toBe('queued');
        expect(pyApi.get_raw_audio).toHaveBeenCalledTimes(1);

        // Advance past the 5-minute cooldown + resume buffer
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 200);

        expect(pyApi.get_raw_audio).toHaveBeenCalledTimes(2);
        expect(pyApi.get_raw_audio.mock.calls[1][0]).toBe('vid_ok_r2');
        expect(useMusicStore.getState().downloads.find((d) => d.id === 'res-dl-2')?.status).toBe('completed');
        expect(useMusicStore.getState().downloadQueue).toHaveLength(0);
        expect(useMusicStore.getState().activeDownloads).toBe(0);
      } finally {
        vi.useRealTimers();
      }
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
