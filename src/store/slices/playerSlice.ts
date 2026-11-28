import { StateCreator } from 'zustand';
import { MusicStore, PlayerSlice } from './types';
import { audioEngine } from '@/lib/audioEngine';
import { toast } from 'sonner';
import { storeText } from './utils';
import { readLocalAudioFile } from '@/lib/localAudioBridge';
import { parseSyncedLyrics } from '@/lib/lyricsParser';

let activeLocalObjectUrl: string | null = null;
let playbackSeq = 0;

function revokeActiveLocalUrl() {
  if (activeLocalObjectUrl) {
    try {
      URL.revokeObjectURL(activeLocalObjectUrl);
    } catch {
      // Ignore revoke failure in test/non-DOM envs
    }
    activeLocalObjectUrl = null;
  }
}

export const createPlayerSlice: StateCreator<
  MusicStore,
  [],
  [],
  PlayerSlice
> = (set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  dominantColor: null,
  currentLyrics: null,
  isLocalPlayback: false,

  setDominantColor: (color) => set({ dominantColor: color }),

  playTrack: (track) => {
    const seq = ++playbackSeq;
    audioEngine.pause();
    revokeActiveLocalUrl();
    set({
      currentTrack: track,
      isPlaying: false,
      isLoading: Boolean(track.preview),
      progress: 0,
      duration: track.duration,
      dominantColor: null,
      currentLyrics: null,
      isLocalPlayback: false,
    });

    document.title = `${track.title} · ${track.artist} - MHL Music`;

    if (track.preview) {
      audioEngine.load(track.preview);
      audioEngine.setVolume(get().volume);
      audioEngine.updateMediaSession({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover,
      });
      audioEngine.play()
        .then(() => {
          if (playbackSeq === seq) {
            set({ isPlaying: true, isLoading: false });
          }
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          if (playbackSeq === seq) {
            console.error('Play failed:', error);
            set({ isLoading: false, isPlaying: false });
            toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
          }
        });
    } else {
      audioEngine.clear?.();
      set({ isLoading: false });
    }
  },

  playDownloadedTrack: async (dl) => {
    const seq = ++playbackSeq;
    const track = dl.track;
    audioEngine.pause();
    revokeActiveLocalUrl();
    set({
      currentTrack: track,
      isPlaying: false,
      isLoading: true,
      progress: 0,
      duration: track.duration,
      dominantColor: null,
      currentLyrics: null,
      isLocalPlayback: true,
    });
    document.title = `${track.title} · ${track.artist} - MHL Music`;

    try {
      const local = await readLocalAudioFile(dl.fileName, dl.mediaUri);
      if (playbackSeq !== seq) {
        if (local?.objectUrl && local.objectUrl.startsWith('blob:')) {
          URL.revokeObjectURL(local.objectUrl);
        }
        return;
      }
      if (!local) {
        set({ isLoading: false, isPlaying: false, isLocalPlayback: false });
        toast.error(storeText(get().uiLanguageMode, 'localFileMissing'));
        return;
      }

      revokeActiveLocalUrl();
      activeLocalObjectUrl = local.objectUrl.startsWith('blob:') ? local.objectUrl : null;
      const parsedLyrics = local.lyrics ? parseSyncedLyrics(local.lyrics) : null;
      set({
        currentLyrics: parsedLyrics && parsedLyrics.lines.length > 0 ? parsedLyrics : null,
      });

      audioEngine.load(local.objectUrl);
      audioEngine.setVolume(get().volume);
      audioEngine.updateMediaSession({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover,
      });
      await audioEngine.play();
      if (playbackSeq === seq) {
        set({ isPlaying: true, isLoading: false });
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      if (playbackSeq === seq) {
        set({ isLoading: false, isPlaying: false, isLocalPlayback: false });
        toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
      }
    }
  },

  togglePlay: () => {
    const { isPlaying, currentTrack } = get();
    if (!currentTrack) return;
    if (isPlaying) {
      audioEngine.pause();
      audioEngine.setPlaybackState('paused');
      set({ isPlaying: false });
    } else {
      const targetId = currentTrack.id;
      void audioEngine.play()
        .then(() => {
          if (get().currentTrack?.id === targetId) {
            audioEngine.setPlaybackState('playing');
            set({ isPlaying: true });
          }
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          if (get().currentTrack?.id === targetId) {
            console.error('Play failed:', error);
            set({ isPlaying: false });
            toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
          }
        });
    }
  },

  setVolume: (v) => {
    audioEngine.setVolume(v);
    set({ volume: v });
  },

  seekTo: (time) => {
    audioEngine.seek(time);
    set({ progress: time });
  },
});
