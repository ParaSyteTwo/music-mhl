import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MusicStore } from './slices/types';
import { createPlayerSlice } from './slices/playerSlice';
import { createSearchSlice } from './slices/searchSlice';
import { createDownloadSlice } from './slices/downloadSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { audioEngine } from '@/lib/audioEngine';
import { isUiLanguageMode, isLyricsTargetLanguage, Lang } from '@/lib/language';

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get, api) => {
      audioEngine.onTimeUpdate = (time) => set({ progress: time });

      audioEngine.onCanPlay = () => {
        set({
          isLoading: false,
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onLoadedMetadata = () => {
        set({
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onWaiting = () => {
        if (get().currentTrack) set({ isLoading: true });
      };

      audioEngine.onStalled = () => {
        if (get().isPlaying) set({ isLoading: true });
      };

      audioEngine.onPlaying = () => set({ isPlaying: true, isLoading: false });
      audioEngine.onPause = () => set({ isPlaying: false, isLoading: false });
      audioEngine.onEnded = () => set({ isPlaying: false, progress: 0 });

      return {
        ...createPlayerSlice(set, get, api),
        ...createSearchSlice(set, get, api),
        ...createDownloadSlice(set, get, api),
        ...createSettingsSlice(set, get, api),
      };
    },
    {
      name: 'mhl-store',
      partialize: (state) => ({
        downloads: state.downloads.filter((d) => d.status === 'completed' || d.status === 'error'),
        volume: state.volume,
        downloadFolderName: state.downloadFolderName,
        uiLanguageMode: state.uiLanguageMode,
        lyricOriginal: state.lyricOriginal,
        lyricRomanization: state.lyricRomanization,
        lyricTranslation: state.lyricTranslation,
        lyricLatinOnly: state.lyricLatinOnly,
        lyricsTargetLanguage: state.lyricsTargetLanguage,
        animeSearchEnabled: state.animeSearchEnabled,
        autoCandidateResolution: state.autoCandidateResolution,
        resolutionProfile: state.resolutionProfile,
        cellularResolutionPolicy: state.cellularResolutionPolicy,
        editionPreference: state.editionPreference,
        mostDownloadedArtists: state.mostDownloadedArtists,
        preferredPlayerPackage: state.preferredPlayerPackage,
        autoDownload: state.autoDownload,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      merge: (persisted: any, current) => ({
        ...current,
        downloads: persisted?.downloads || [],
        volume: persisted?.volume ?? 0.8,
        downloadFolderName: persisted?.downloadFolderName || '',
        uiLanguageMode: isUiLanguageMode(persisted?.uiLanguageMode)
          ? persisted.uiLanguageMode
          : isUiLanguageMode(persisted?.appLanguage)
            ? (persisted.appLanguage as Lang)
            : 'system',
        lyricOriginal: persisted?.lyricOriginal ?? true,
        lyricRomanization: persisted?.lyricRomanization ?? true,
        lyricTranslation: persisted?.lyricTranslation ?? true,
        lyricLatinOnly: persisted?.lyricLatinOnly ?? false,
        lyricsTargetLanguage: isLyricsTargetLanguage(persisted?.lyricsTargetLanguage)
          ? persisted.lyricsTargetLanguage
          : 'system',
        animeSearchEnabled: persisted?.animeSearchEnabled ?? false,
        autoCandidateResolution: persisted?.autoCandidateResolution ?? true,
        resolutionProfile: persisted?.resolutionProfile === 'economy' || persisted?.resolutionProfile === 'adaptive'
          ? persisted.resolutionProfile
          : persisted?.androidFastSearchMode === true ? 'economy' : 'adaptive',
        cellularResolutionPolicy: ['off', 'light', 'full'].includes(persisted?.cellularResolutionPolicy)
          ? persisted.cellularResolutionPolicy
          : 'light',
        editionPreference: ['catalog', 'explicit', 'clean', 'ask'].includes(persisted?.editionPreference)
          ? persisted.editionPreference
          : 'catalog',
        mostDownloadedArtists: persisted?.mostDownloadedArtists ?? [],
        preferredPlayerPackage: persisted?.preferredPlayerPackage ?? null,
        autoDownload: persisted?.autoDownload ?? true,
      }),
    }
  )
);
