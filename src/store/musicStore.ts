import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Track, Download } from '@/types/music';
import { audioEngine } from '@/lib/audioEngine';
import { searchDeezer, searchYouTube, getYouTubeStream } from '@/lib/api/musicApi';
import { writeID3Tags } from '@/lib/id3Writer';

interface MusicStore {
  // Player
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  progress: number;
  duration: number;

  playTrack: (track: Track) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  seekTo: (time: number) => void;

  // Search
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  performSearch: (query: string) => Promise<void>;

  // Downloads
  downloads: Download[];
  startDownload: (track: Track) => void;
  removeDownload: (id: string) => void;
}

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get) => {
      audioEngine.onTimeUpdate = (time) => set({ progress: time });

      audioEngine.onCanPlay = () => {
        set({
          isLoading: false,
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onEnded = () => set({ isPlaying: false, progress: 0 });

      audioEngine.onError = (error) => {
        console.error('Audio error:', error);
        set({ isLoading: false, isPlaying: false });
      };

      return {
        // ─── Player ───
        currentTrack: null,
        isPlaying: false,
        isLoading: false,
        volume: 0.8,
        progress: 0,
        duration: 0,

        playTrack: (track) => {
          set({
            currentTrack: track,
            isPlaying: false,
            isLoading: true,
            progress: 0,
            duration: track.duration,
          });

          if (track.preview) {
            audioEngine.load(track.preview);
            audioEngine.setVolume(get().volume);
            audioEngine.updateMediaSession({
              title: track.title,
              artist: track.artist,
              album: track.album,
              artwork: track.cover,
            });
            audioEngine.play().then(() => set({ isPlaying: true, isLoading: false }));
          } else {
            set({ isLoading: false });
          }
        },

        togglePlay: () => {
          const { isPlaying, currentTrack } = get();
          if (!currentTrack) return;
          if (isPlaying) {
            audioEngine.pause();
          } else {
            audioEngine.play();
          }
          set({ isPlaying: !isPlaying });
        },

        setVolume: (v) => {
          audioEngine.setVolume(v);
          set({ volume: v });
        },

        seekTo: (time) => {
          audioEngine.seek(time);
          set({ progress: time });
        },

        // ─── Search ───
        searchQuery: '',
        searchResults: [],
        isSearching: false,

        performSearch: async (query) => {
          if (!query.trim()) {
            set({ searchResults: [], isSearching: false, searchQuery: '' });
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

        // ─── Downloads ───
        downloads: [],

        startDownload: async (track) => {
          const id = `d${Date.now()}`;
          set((s) => ({
            downloads: [...s.downloads, { id, track, progress: 0, status: 'downloading' as const }],
          }));

          const updateDl = (patch: Partial<Download>) =>
            set((s) => ({
              downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            }));

          try {
            updateDl({ progress: 10 });
            const results = await searchYouTube(`${track.title} ${track.artist}`);
            if (!results.length) throw new Error('No se encontró en YouTube');
            updateDl({ progress: 30 });

            const streamData = await getYouTubeStream(results[0].videoId);
            const mp3Url = streamData.stream?.url;
            if (!mp3Url) throw new Error('No se pudo obtener el MP3');
            updateDl({ progress: 60 });

            const response = await fetch(mp3Url);
            if (!response.ok) throw new Error('Error descargando el archivo');
            const mp3Buffer = await response.arrayBuffer();
            updateDl({ progress: 80 });

            const taggedBlob = await writeID3Tags(mp3Buffer, {
              title: track.title,
              artist: track.artist,
              album: track.album,
              coverUrl: track.cover,
            });
            updateDl({ progress: 95 });

            const fileName = `${track.title} - ${track.artist}.mp3`.replace(/[/\\?%*:|"<>]/g, '');
            const blobUrl = URL.createObjectURL(taggedBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

            updateDl({ progress: 100, status: 'completed' });
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Download failed';
            console.error('Download error:', msg);
            updateDl({ status: 'error', error: msg });
          }
        },

        removeDownload: (id) =>
          set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        downloads: state.downloads.filter((d) => d.status === 'completed' || d.status === 'error'),
        volume: state.volume,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        downloads: persisted?.downloads || [],
        volume: persisted?.volume ?? 0.8,
      }),
    }
  )
);
