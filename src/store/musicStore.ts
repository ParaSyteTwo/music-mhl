import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Playlist, Download, AudioFormat, AudioSource } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, searchYouTube, getYouTubeStream, fetchLyrics } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';

// ─── Settings ───
export type FileNameFormat = 'title-artist' | 'artist-title' | 'title';
export type DownloadQuality = 'auto' | 'high' | 'medium' | 'low';
export type RepeatMode = 'off' | 'all' | 'one';

export interface AppSettings {
  downloadQuality: DownloadQuality;
  fileNameFormat: FileNameFormat;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  isTranslating: boolean;
  volume: number;
  progress: number;
  duration: number;
  showLyrics: boolean;
  audioSource: AudioSource;
  error: string | null;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
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
  playQueue: (tracks: Track[], startIndex?: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  // History
  history: Track[];
  lastPlayedTrackId: string | null;
  clearHistory: () => void;
  addToHistoryIfNewTrack: (track: Track) => void;

  // Library
  library: Track[];
  addToLibrary: (track: Track) => void;
  removeFromLibrary: (id: string) => void;

  // Playlists
  playlists: Playlist[];
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  // Downloads
  downloads: Download[];
  startDownload: (track: Track, format: AudioFormat) => void;
  removeDownload: (id: string) => void;
  updateDownloadProgress: (id: string, progress: number) => void;

  // Search
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  setSearchQuery: (q: string) => void;
  performSearch: (query: string) => Promise<void>;

  // Lyrics
  loadLyrics: (track: Track) => Promise<void>;
  loadTranslation: (track: Track) => Promise<void>;

  // Settings
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

function getFileName(track: Track, format: FileNameFormat): string {
  let name = '';
  switch (format) {
    case 'artist-title': name = `${track.artist} - ${track.title}`; break;
    case 'title': name = track.title; break;
    case 'title-artist':
    default: name = `${track.title} - ${track.artist}`; break;
  }
  return `${name}.mp3`.replace(/[/\\?%*:|"<>]/g, '');
}

const historyAddingTimeout: { trackId: string | null; timeout: NodeJS.Timeout | null } = {
  trackId: null,
  timeout: null,
};

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get) => {
      // Wire up audio engine events
      audioEngine.onTimeUpdate = (time) => {
        set((s) => ({ player: { ...s.player, progress: time } }));
      };

      audioEngine.onEnded = () => {
        const { repeat, queue, queueIndex } = get().player;
        if (repeat === 'one') {
          audioEngine.seek(0);
          audioEngine.play();
          return;
        }
        // Auto-advance queue
        get().skipNext();
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

      audioEngine.onPlayControlPressed = () => {
        get().togglePlay();
      };

      audioEngine.onPauseControlPressed = () => {
        get().togglePlay();
      };

      audioEngine.onNextControlPressed = () => {
        get().skipNext();
      };

      audioEngine.onPrevControlPressed = () => {
        get().skipPrev();
      };

      // Add to history when audio actually starts playing
      // Uses debounce to prevent duplicate additions from multiple 'play' events
      audioEngine.onPlay = () => {
        const currentTrack = get().player.currentTrack;
        if (!currentTrack) return;

        // Clear previous timeout if track changed
        if (historyAddingTimeout.trackId !== currentTrack.id) {
          if (historyAddingTimeout.timeout) {
            clearTimeout(historyAddingTimeout.timeout);
          }
          historyAddingTimeout.trackId = currentTrack.id;
          
          // Add to history immediately for new track
          get().addToHistoryIfNewTrack(currentTrack);
          
          // Set timeout to prevent adding again for 2 seconds
          historyAddingTimeout.timeout = setTimeout(() => {
            historyAddingTimeout.trackId = null;
            historyAddingTimeout.timeout = null;
          }, 2000);
        }
      };

      return {
        // ─── Settings ───
        settings: {
          downloadQuality: 'auto',
          fileNameFormat: 'title-artist',
        },
        updateSettings: (patch) => set((s) => ({
          settings: { ...s.settings, ...patch },
        })),

        // ─── Player ───
        player: {
          currentTrack: null,
          isPlaying: false,
          isLoading: false,
          isTranslating: false,
          volume: 0.8,
          progress: 0,
          duration: 0,
          showLyrics: false,
          audioSource: 'preview',
          error: null,
          queue: [],
          queueIndex: -1,
          shuffle: false,
          repeat: 'off',
        },

        playQueue: (tracks, startIndex = 0) => {
          set((s) => ({
            player: { ...s.player, queue: tracks, queueIndex: startIndex },
          }));
          if (tracks[startIndex]) {
            get().playTrack(tracks[startIndex]);
          }
        },

        skipNext: () => {
          const { queue, queueIndex, shuffle, repeat } = get().player;
          if (queue.length === 0) {
            set((s) => ({ player: { ...s.player, isPlaying: false, progress: 0 } }));
            return;
          }

          let nextIndex: number;
          if (shuffle) {
            nextIndex = Math.floor(Math.random() * queue.length);
          } else {
            nextIndex = queueIndex + 1;
          }

          if (nextIndex >= queue.length) {
            if (repeat === 'all') {
              nextIndex = 0;
            } else {
              set((s) => ({ player: { ...s.player, isPlaying: false, progress: 0 } }));
              return;
            }
          }

          set((s) => ({ player: { ...s.player, queueIndex: nextIndex } }));
          get().playTrack(queue[nextIndex]);
        },

        skipPrev: () => {
          const { queue, queueIndex, progress } = get().player;
          // If more than 3s into the song, restart it
          if (progress > 3) {
            audioEngine.seek(0);
            set((s) => ({ player: { ...s.player, progress: 0 } }));
            return;
          }
          if (queue.length === 0) return;
          const prevIndex = Math.max(0, queueIndex - 1);
          set((s) => ({ player: { ...s.player, queueIndex: prevIndex } }));
          get().playTrack(queue[prevIndex]);
        },

        toggleShuffle: () => set((s) => ({
          player: { ...s.player, shuffle: !s.player.shuffle },
        })),

        toggleRepeat: () => set((s) => {
          const modes: RepeatMode[] = ['off', 'all', 'one'];
          const idx = modes.indexOf(s.player.repeat);
          return { player: { ...s.player, repeat: modes[(idx + 1) % 3] } };
        }),

        // ─── History ───
        history: [],
        lastPlayedTrackId: null,
        clearHistory: () => set({ history: [], lastPlayedTrackId: null }),
        addToHistoryIfNewTrack: (track) => {
          // Only add if this is a different track from the last played one
          const lastId = get().lastPlayedTrackId;
          if (lastId === track.id) {
            return; // Same track, don't add again
          }
          // Add to history and update lastPlayedTrackId
          set((s) => {
            const filtered = s.history.filter(t => t.id !== track.id);
            const newHistory = [track, ...filtered].slice(0, 20);
            return { history: newHistory, lastPlayedTrackId: track.id };
          });
        },

        playTrack: async (track) => {
          // History is now added via addToHistoryIfNewTrack when audio actually plays
          // Add to queue if not already there
          const { queue } = get().player;
          const trackInQueue = queue.findIndex(t => t.id === track.id);
          if (trackInQueue === -1 && queue.length === 0) {
            set((s) => ({ player: { ...s.player, queue: [track], queueIndex: 0 } }));
          } else if (trackInQueue >= 0) {
            set((s) => ({ player: { ...s.player, queueIndex: trackInQueue } }));
          }

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
              audioEngine.updateMediaSession({
                title: track.title,
                artist: track.artist,
                album: track.album,
                artwork: track.cover,
              });
              await audioEngine.play();
              set((s) => ({ player: { ...s.player, isPlaying: true, isLoading: false } }));
              audioEngine.setPlaybackState('playing');
            } catch (e) {
              console.error('Preview play failed:', e);
              set((s) => ({
                player: { ...s.player, isLoading: false, error: 'Error al reproducir preview' },
              }));
            }
          } else {
            await get().playTrackWithYouTube(track);
          }

          get().loadLyrics(track);
        },

        playTrackWithYouTube: async (track) => {
          // History is now added via addToHistoryIfNewTrack when audio actually plays
          
          // Strategy: Try YouTube first, fallback to preview if available
          let youtubeSucceeded = false;
          
          // If preview exists, start with it immediately while searching for YouTube stream
          if (track.preview) {
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

            audioEngine.load(track.preview);
            audioEngine.setVolume(get().player.volume);
            audioEngine.updateMediaSession({
              title: track.title,
              artist: track.artist,
              album: track.album,
              artwork: track.cover,
            });
            await audioEngine.play();
            set((s) => ({
              player: {
                ...s.player,
                isPlaying: true,
                isLoading: false,
                currentTrack: { ...track, audioSourceBadge: '📺 Preview 30s' },
              },
            }));
            audioEngine.setPlaybackState('playing');
          } else {
            // No preview, show loading state
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
          }

          // Try to fetch YouTube stream in parallel
          try {
            console.log('[playTrackWithYouTube] 1. Buscando en YouTube:', track.title, track.artist);
            
            let videoId = track.youtubeId;
            if (!videoId) {
              const results = await searchYouTube(`${track.title} ${track.artist}`);
              console.log('[playTrackWithYouTube] Resultados de búsqueda:', results.length, results);
              if (results.length === 0) throw new Error('No se encontró en YouTube');
              videoId = results[0].videoId;
            }

            console.log('[playTrackWithYouTube] 2. VideoId encontrado:', videoId);
            const streamData = await getYouTubeStream(videoId!);
            console.log('[playTrackWithYouTube] 3. StreamData recibido:', JSON.stringify(streamData), 'URL:', streamData.stream?.url);
            
            const streamUrl = streamData.stream?.url;
            console.log('[playTrackWithYouTube] 4. URL del stream:', streamUrl);
            
            if (!streamUrl) {
              console.error('[playTrackWithYouTube] URL del stream es null/undefined');
              throw new Error('No se pudo obtener el stream de audio (URL vacía)');
            }

            console.log('[playTrackWithYouTube] Cargando stream...');
            // YouTube stream found - crossfade to it
            audioEngine.load(streamUrl);
            audioEngine.setVolume(get().player.volume);
            audioEngine.updateMediaSession({
              title: track.title,
              artist: track.artist,
              album: track.album,
              artwork: track.cover,
            });
            
            // Only auto-play if not already playing (preview case)
            const currentState = get().player;
            if (!currentState.isPlaying) {
              console.log('[playTrackWithYouTube] Reproduciendo desde el principio...');
              await audioEngine.play();
            }
            
            youtubeSucceeded = true;
            set((s) => ({
              player: {
                ...s.player,
                isPlaying: true,
                isLoading: false,
                audioSource: 'youtube',
                currentTrack: { ...track, youtubeId: videoId, audioSourceBadge: '🎵 Full · YouTube' },
              },
            }));
            audioEngine.setPlaybackState('playing');
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'YouTube playback failed';
            console.error('[playTrackWithYouTube] Error:', msg);

            // If YouTube failed and no preview was loaded, show different error messages
            if (!track.preview) {
              let errorMsg = 'No se pudo reproducir esta canción';
              if (msg.includes('API')) {
                errorMsg = 'YouTube API no disponible - intenta configurar RapidAPI en .env';
              }
              
              set((s) => ({
                player: {
                  ...s.player,
                  isLoading: false,
                  error: errorMsg,
                  currentTrack: { ...track, audioSourceBadge: '⚠️ Sin stream' },
                },
              }));
              console.warn('[playTrackWithYouTube] No preview available, showing error to user');
            } else {
              // If preview is playing, just log the error but continue with preview
              console.log('[playTrackWithYouTube] YouTube failed, continuing with preview');
              set((s) => ({
                player: {
                  ...s.player,
                  currentTrack: { ...track, audioSourceBadge: '📺 Preview 30s (YouTube no disponible)' },
                },
              }));
            }
          }

          get().loadLyrics(track);
        },

        togglePlay: () => {
          const { isPlaying, currentTrack } = get().player;
          if (!currentTrack) return;
          if (isPlaying) { audioEngine.pause(); } else { audioEngine.play(); }
          const newState = !isPlaying;
          set((s) => ({ player: { ...s.player, isPlaying: newState } }));
          audioEngine.setPlaybackState(newState ? 'playing' : 'paused');
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

        // ─── Library ───
        library: [],
        addToLibrary: (track) => set((s) => ({
          library: s.library.find(t => t.id === track.id)
            ? s.library
            : [...s.library, { ...track, isDownloaded: true }],
        })),
        removeFromLibrary: (id) => set((s) => ({
          library: s.library.filter(t => t.id !== id),
        })),

        // ─── Playlists ───
        playlists: [],
        createPlaylist: (name) => set((s) => ({
          playlists: [...s.playlists, { id: `p${Date.now()}`, name, tracks: [], createdAt: new Date() }],
        })),
        deletePlaylist: (id) => set((s) => ({
          playlists: s.playlists.filter(p => p.id !== id),
        })),
        renamePlaylist: (id, name) => set((s) => ({
          playlists: s.playlists.map(p => p.id === id ? { ...p, name } : p),
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

        // ─── Downloads ───
        downloads: [],
        startDownload: async (track, format) => {
          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, format, progress: 0, status: 'downloading' }],
          }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map(d => (d.id === id ? { ...d, ...patch } : d)),
            }));

          try {
            updateDl({ progress: 10 });
            let videoId = track.youtubeId;
            if (!videoId) {
              const results = await searchYouTube(`${track.title} ${track.artist}`);
              if (!results.length) throw new Error('No se encontró en YouTube');
              videoId = results[0].videoId;
            }
            updateDl({ progress: 30 });

            const streamData = await getYouTubeStream(videoId!);
            const mp3Url = streamData.stream?.url;
            if (!mp3Url) throw new Error('No se pudo obtener el MP3');
            updateDl({ progress: 70 });

            const response = await fetch(mp3Url);
            if (!response.ok) throw new Error('Error descargando el archivo MP3');
            const mp3ArrayBuffer = await response.arrayBuffer();
            updateDl({ progress: 85 });

            const taggedBlob = await writeID3Tags(mp3ArrayBuffer, {
              title: track.title,
              artist: track.artist,
              album: track.album,
              coverUrl: track.cover,
            });
            updateDl({ progress: 95 });

            const fileName = getFileName(track, get().settings.fileNameFormat);
            const blobUrl = URL.createObjectURL(taggedBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

            updateDl({ progress: 100, status: 'completed', downloadUrl: mp3Url });
            get().addToLibrary(track);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Download failed';
            console.error('Download error:', msg);
            updateDl({ status: 'error', error: msg });
          }
        },
        removeDownload: (id) => set((s) => ({
          downloads: s.downloads.filter(d => d.id !== id),
        })),
        updateDownloadProgress: (id, progress) => set((s) => ({
          downloads: s.downloads.map(d =>
            d.id === id ? { ...d, progress, status: progress >= 100 ? 'completed' : 'downloading' } : d
          ),
        })),

        // ─── Search ───
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

        // ─── Lyrics ───
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

              // Auto-load translation if not English
              const systemLang = navigator.language.split('-')[0];
              if (systemLang !== 'en' && result.lyrics) {
                get().loadTranslation(updatedTrack);
              }
            }
          } catch (e) {
            console.warn('Failed to load lyrics:', e);
          }
        },

        loadTranslation: async (track) => {
          // Translation disabled - no longer needed
        },
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        library: state.library,
        playlists: state.playlists,
        downloads: state.downloads.filter(d => d.status === 'completed' || d.status === 'error'),
        settings: state.settings,
        player: {
          volume: state.player.volume,
          shuffle: state.player.shuffle,
          repeat: state.player.repeat,
        },
      }),
      merge: (persisted: any, current) => ({
        ...current,
        library: persisted?.library || [],
        playlists: persisted?.playlists || [],
        downloads: persisted?.downloads || [],
        settings: { ...current.settings, ...(persisted?.settings || {}) },
        player: {
          ...current.player,
          volume: persisted?.player?.volume ?? 0.8,
          shuffle: persisted?.player?.shuffle ?? false,
          repeat: persisted?.player?.repeat ?? 'off',
        },
      }),
    }
  )
);
