import { StateCreator } from 'zustand';
import { MusicStore, PlayerSlice } from './types';
import { audioEngine } from '@/lib/audioEngine';
import { toast } from 'sonner';
import { storeText } from './utils';

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

  setDominantColor: (color) => set({ dominantColor: color }),

  playTrack: (track) => {
    audioEngine.pause();
    set({
      currentTrack: track,
      isPlaying: false,
      isLoading: true,
      progress: 0,
      duration: track.duration,
      dominantColor: null,
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
        .then(() => set({ isPlaying: true, isLoading: false }))
        .catch((error) => {
          console.error('Play failed:', error);
          set({ isLoading: false, isPlaying: false });
          toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
        });
    } else {
      set({ isLoading: false });
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
      void audioEngine.play()
        .then(() => {
          audioEngine.setPlaybackState('playing');
          set({ isPlaying: true });
        })
        .catch((error) => {
          console.error('Play failed:', error);
          set({ isPlaying: false });
          toast.error(storeText(get().uiLanguageMode, 'playbackFailed'));
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
