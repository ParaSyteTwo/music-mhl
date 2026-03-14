import { create } from 'zustand';
import { Track, Playlist, Download, AudioFormat, AudioSource } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, searchYouTube, getYouTubeStream, fetchLyrics } from '@/lib/api/musicApi';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  progress: number;
  duration: number;
  showLyrics: boolean;
  audioSource: AudioSource;
  error: string | null;
}

interface MusicStore {
  // Player
  player: PlayerState;
  playTrack: (track: Track) => Promise<void>;
  playTrackWithYouTube: (track: Track) => Promise<void>;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  seekTo: (time: number) => void;
  setProgress: (p: number) => void;
  toggleLyrics: () => void;

  // Library
  library: Track[];
  addToLibrary: (track: Track) => void;
  removeFromLibrary: (id: string) => void;

  // Playlists
  playlists: Playlist[];
  createPlaylist: (name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  // Downloads
  downloads: Download[];
  startDownload: (track: Track, format: AudioFormat) => void;
  updateDownloadProgress: (id: string, progress: number) => void;

  // Search
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  setSearchQuery: (q: string) => void;
  performSearch: (query: string) => Promise<void>;

  // Lyrics
  loadLyrics: (track: Track) => Promise<void>;
}

export const useMusicStore = create<MusicStore>((set, get) => {
  // Wire up audio engine events
  audioEngine.onTimeUpdate = (time) => {
    set((s) => ({ player: { ...s.player, progress: time } }));
  };

  audioEngine.onEnded = () => {
    set((s) => ({ player: { ...s.player, isPlaying: false, progress: 0 } }));
  };

  audioEngine.onCanPlay = () => {
    set((s) => ({
      player: {
        ...s.player,
        isLoading: false,
        duration: audioEngine.duration || s.player.currentTrack?.duration || 0,
      },
    }));
  };

  audioEngine.onError = (error) => {
    console.error('Audio error:', error);
    set((s) => ({ player: { ...s.player, isLoading: false, error, isPlaying: false } }));
  };

  return {
    player: {
      currentTrack: null,
      isPlaying: false,
      isLoading: false,
      volume: 0.8,
      progress: 0,
      duration: 0,
      showLyrics: false,
      audioSource: 'preview',
      error: null,
    },

    // Play track - tries preview first, then YouTube
    playTrack: async (track) => {
      set((s) => ({
        player: {
          ...s.player,
          currentTrack: track,
          isPlaying: false,
          isLoading: true,
          progress: 0,
          duration: track.duration,
          audioSource: 'preview',
          error: null,
        },
      }));

      if (track.preview) {
        try {
          audioEngine.load(track.preview);
          audioEngine.setVolume(get().player.volume);
          await audioEngine.play();
          set((s) => ({ player: { ...s.player, isPlaying: true, isLoading: false } }));
        } catch (e) {
          console.error('Preview play failed:', e);
          set((s) => ({
            player: { ...s.player, isLoading: false, error: 'Error al reproducir preview' },
          }));
        }
      } else {
        // No preview available, try YouTube
        await get().playTrackWithYouTube(track);
      }

      // Load lyrics in background
      get().loadLyrics(track);
    },

    // Play full song via YouTube/Piped
    playTrackWithYouTube: async (track) => {
      set((s) => ({
        player: {
          ...s.player,
          currentTrack: track,
          isPlaying: false,
          isLoading: true,
          progress: 0,
          duration: track.duration,
          audioSource: 'youtube',
          error: null,
        },
      }));

      try {
        // If we already have a youtubeId, use it directly
        let videoId = track.youtubeId;

        if (!videoId) {
          // Search YouTube for this track
          const results = await searchYouTube(`${track.title} ${track.artist}`);
          if (results.length === 0) {
            throw new Error('No se encontró en YouTube');
          }
          videoId = results[0].videoId;
        }

        // Get stream URL
        const streamData = await getYouTubeStream(videoId!);
        const streamUrl = streamData.stream?.url;

        if (!streamUrl) {
          throw new Error('No se pudo obtener el stream de audio');
        }

        audioEngine.load(streamUrl);
        audioEngine.setVolume(get().player.volume);
        await audioEngine.play();
        set((s) => ({
          player: {
            ...s.player,
            isPlaying: true,
            isLoading: false,
            currentTrack: { ...track, youtubeId: videoId },
          },
        }));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'YouTube playback failed';
        console.error('YouTube playback error:', msg);

        // Fallback to preview if available
        if (track.preview) {
          audioEngine.load(track.preview);
          audioEngine.setVolume(get().player.volume);
          await audioEngine.play();
          set((s) => ({
            player: {
              ...s.player,
              isPlaying: true,
              isLoading: false,
              audioSource: 'preview',
              error: `YouTube falló, usando preview · ${msg}`,
            },
          }));
        } else {
          set((s) => ({
            player: { ...s.player, isLoading: false, error: msg },
          }));
        }
      }

      get().loadLyrics(track);
    },

    togglePlay: () => {
      const { isPlaying, currentTrack } = get().player;
      if (!currentTrack) return;

      if (isPlaying) {
        audioEngine.pause();
      } else {
        audioEngine.play();
      }
      set((s) => ({ player: { ...s.player, isPlaying: !isPlaying } }));
    },

    setVolume: (v) => {
      audioEngine.setVolume(v);
      set((s) => ({ player: { ...s.player, volume: v } }));
    },

    seekTo: (time) => {
      audioEngine.seek(time);
      set((s) => ({ player: { ...s.player, progress: time } }));
    },

    setProgress: (p) => set((s) => ({ player: { ...s.player, progress: p } })),

    toggleLyrics: () => set((s) => ({ player: { ...s.player, showLyrics: !s.player.showLyrics } })),

    // Library
    library: [],
    addToLibrary: (track) => set((s) => ({
      library: s.library.find(t => t.id === track.id)
        ? s.library
        : [...s.library, { ...track, isDownloaded: true }],
    })),
    removeFromLibrary: (id) => set((s) => ({
      library: s.library.filter(t => t.id !== id),
    })),

    // Playlists
    playlists: [],
    createPlaylist: (name) => set((s) => ({
      playlists: [...s.playlists, { id: `p${Date.now()}`, name, tracks: [], createdAt: new Date() }],
    })),
    addToPlaylist: (playlistId, track) => set((s) => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId && !p.tracks.find(t => t.id === track.id)
          ? { ...p, tracks: [...p.tracks, track] }
          : p
      ),
    })),
    removeFromPlaylist: (playlistId, trackId) => set((s) => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId) } : p
      ),
    })),

    // Downloads
    downloads: [],
    startDownload: async (track, format) => {
      const id = `d${Date.now()}`;
      set((s) => ({
        downloads: [...s.downloads, { id, track, format, progress: 0, status: 'downloading' }],
      }));

      const updateDl = (patch: Partial<import('@/types/music').Download>) =>
        set((s) => ({
          downloads: s.downloads.map(d => (d.id === id ? { ...d, ...patch } : d)),
        }));

      try {
        // Step 1: Search YouTube for this track (20%)
        updateDl({ progress: 10 });
        let videoId = track.youtubeId;
        if (!videoId) {
          const results = await searchYouTube(`${track.title} ${track.artist}`);
          if (!results.length) throw new Error('No se encontró en YouTube');
          videoId = results[0].videoId;
        }
        updateDl({ progress: 30 });

        // Step 2: Get MP3 URL via RapidAPI (60%)
        const streamData = await getYouTubeStream(videoId!);
        const mp3Url = streamData.stream?.url;
        if (!mp3Url) throw new Error('No se pudo obtener el MP3');
        updateDl({ progress: 70 });

        // Step 3: Trigger browser download
        const fileName = `${track.artist} - ${track.title}.mp3`.replace(/[/\\?%*:|"<>]/g, '');
        
        // Try fetching as blob for proper download with filename
        try {
          const response = await fetch(mp3Url);
          if (!response.ok) throw new Error('Fetch failed');
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch {
          // Fallback: open URL directly (may not set filename)
          const a = document.createElement('a');
          a.href = mp3Url;
          a.download = fileName;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        updateDl({ progress: 100, status: 'completed', downloadUrl: mp3Url });
        get().addToLibrary(track);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Download failed';
        console.error('Download error:', msg);
        updateDl({ status: 'error', error: msg });
      }
    },
    updateDownloadProgress: (id, progress) => set((s) => ({
      downloads: s.downloads.map(d =>
        d.id === id ? { ...d, progress, status: progress >= 100 ? 'completed' : 'downloading' } : d
      ),
    })),

    // Search
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    setSearchQuery: (q) => set({ searchQuery: q }),

    performSearch: async (query) => {
      if (!query.trim()) {
        set({ searchResults: [], isSearching: false });
        return;
      }

      set({ isSearching: true, searchQuery: query });

      try {
        const tracks = await searchDeezer(query);
        set({ searchResults: tracks, isSearching: false });
      } catch (error) {
        console.error('Search error:', error);
        set({ isSearching: false });
      }
    },

    // Lyrics
    loadLyrics: async (track) => {
      try {
        const result = await fetchLyrics(track.title, track.artist, track.album, track.duration);
        if (result) {
          const updatedTrack = {
            ...track,
            lyrics: result.lyrics,
            syncedLyrics: result.syncedLyrics,
          };
          set((s) => ({
            player: {
              ...s.player,
              currentTrack: s.player.currentTrack?.id === track.id ? updatedTrack : s.player.currentTrack,
            },
          }));
        }
      } catch (e) {
        console.warn('Failed to load lyrics:', e);
      }
    },
  };
});
