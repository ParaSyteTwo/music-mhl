import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useMusicStore } from './musicStore';

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
      localLibrary: [],
      localFileRefs: new Map(),
      isImporting: false,
      savedLocalPaths: [],
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

      const initialPlayingState = store.isPlaying;
      store.togglePlay();

      expect(store.isPlaying).not.toBe(initialPlayingState);
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
      store.setVolume(0.5);

      expect(store.volume).toBe(0.5);
    });

    it('should handle volume at extremes', () => {
      const store = useMusicStore.getState();

      store.setVolume(0);
      expect(store.volume).toBe(0);

      store.setVolume(1);
      expect(store.volume).toBe(1);
    });
  });

  describe('Seeking', () => {
    it('should seek to specific time', () => {
      const store = useMusicStore.getState();
      store.seekTo(45);

      expect(store.progress).toBe(45);
    });

    it('should seek to zero', () => {
      const store = useMusicStore.getState();
      store.progress = 100;
      store.seekTo(0);

      expect(store.progress).toBe(0);
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
  });

  describe('Downloads', () => {
    it('should initialize with empty downloads', () => {
      const state = useMusicStore.getState();

      expect(state.downloads).toEqual([]);
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
      store.removeDownload('d1');

      expect(store.downloads).toEqual([]);
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
      store.downloadFolderName = 'test-folder';

      store.clearDownloadFolder();

      expect(store.downloadFolder).toBeNull();
      expect(store.downloadFolderName).toBe('');
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

      store.setDominantColor(testColor);

      expect(store.dominantColor).toBe(testColor);
    });

    it('should clear dominant color', () => {
      const store = useMusicStore.getState();
      store.setDominantColor('#FF5733');
      store.setDominantColor(null);

      expect(store.dominantColor).toBeNull();
    });
  });

  describe('Local Library', () => {
    it('should initialize with empty local library', () => {
      const state = useMusicStore.getState();

      expect(state.localLibrary).toEqual([]);
      expect(state.localFileRefs.size).toBe(0);
    });

    it('should increment play count for local track', () => {
      const localTrack = {
        id: 'local-1',
        title: 'Local Song',
        artist: 'Local Artist',
        album: 'Local Album',
        duration: 180,
        cover: '',
        isLocal: true as const,
        localPath: '/music/song.mp3',
        genre: 'Rock',
        playCount: 0,
        importedAt: Date.now(),
      };

      const store = useMusicStore.getState();
      store.localLibrary = [localTrack];

      store.incrementPlayCount('local-1');

      expect(store.localLibrary[0].playCount).toBe(1);
    });

    it('should increment play count multiple times', () => {
      const localTrack = {
        id: 'local-1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
        isLocal: true as const,
        localPath: '/music/song.mp3',
        genre: 'Rock',
        playCount: 0,
        importedAt: Date.now(),
      };

      const store = useMusicStore.getState();
      store.localLibrary = [localTrack];

      store.incrementPlayCount('local-1');
      store.incrementPlayCount('local-1');
      store.incrementPlayCount('local-1');

      expect(store.localLibrary[0].playCount).toBe(3);
    });

    it('should remove local track', () => {
      const localTrack = {
        id: 'local-1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        cover: '',
        isLocal: true as const,
        localPath: '/music/song.mp3',
        genre: 'Rock',
        playCount: 0,
        importedAt: Date.now(),
      };

      const store = useMusicStore.getState();
      store.localLibrary = [localTrack];

      store.removeLocalTrack('local-1');

      expect(store.localLibrary).toEqual([]);
    });

    it('should clear entire local library', () => {
      const tracks = [
        {
          id: 'local-1',
          title: 'Song 1',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          cover: '',
          isLocal: true as const,
          localPath: '/music/song1.mp3',
          genre: 'Rock',
          playCount: 0,
          importedAt: Date.now(),
        },
        {
          id: 'local-2',
          title: 'Song 2',
          artist: 'Artist',
          album: 'Album',
          duration: 200,
          cover: '',
          isLocal: true as const,
          localPath: '/music/song2.mp3',
          genre: 'Pop',
          playCount: 5,
          importedAt: Date.now(),
        },
      ];

      const store = useMusicStore.getState();
      store.localLibrary = tracks;

      store.clearLocalLibrary();

      expect(store.localLibrary).toEqual([]);
      expect(store.localFileRefs.size).toBe(0);
    });
  });

  describe('State Consistency', () => {
    it('should maintain consistent state across volume and seek operations', () => {
      const store = useMusicStore.getState();

      store.setVolume(0.7);
      store.seekTo(50);

      expect(store.volume).toBe(0.7);
      expect(store.progress).toBe(50);
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
      store.setVolume(0.6);

      expect(store.currentTrack?.id).toBe('t1');
      expect(store.volume).toBe(0.6);
    });
  });
});
