import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MusicStore, ResolutionProfile, CellularResolutionPolicy } from './slices/types';
import { createPlayerSlice } from './slices/playerSlice';
import { createSearchSlice } from './slices/searchSlice';
import { createDownloadSlice } from './slices/downloadSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createVideoSlice } from './slices/videoSlice';
import { audioEngine } from '@/lib/audioEngine';
import { isUiLanguageMode, isLyricsTargetLanguage, Lang } from '@/lib/language';
import { applyThemeToDOM } from '@/lib/themes/themeCatalog';

export type { ResolutionProfile, CellularResolutionPolicy, MusicStore };

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get, api) => {
      audioEngine.onTimeUpdate = (time) => {
        set({ progress: time });
      };

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

      audioEngine.onPlay = () => {
        set({ isPlaying: true, isLoading: false });
      };

      audioEngine.onPause = () => {
        set({ isPlaying: false });
      };

      audioEngine.onError = (errorMsg) => {
        set({ isPlaying: false, isLoading: false });
        console.warn('[AudioEngine] Playback error:', errorMsg);
      };

      audioEngine.onEnded = () => {
        set({ isPlaying: false, progress: 0 });
      };

      return {
        ...createPlayerSlice(set, get, api),
        ...createSearchSlice(set, get, api),
        ...createDownloadSlice(set, get, api),
        ...createSettingsSlice(set, get, api),
        ...createVideoSlice(set, get, api),
      };
    },
    {
      name: 'mhl-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        downloads: state.downloads
          .filter((d) => d.status === 'completed' || d.status === 'error')
          .slice(-100),
        volume: state.volume,
        downloadFolderName: state.downloadFolderName,
        uiLanguageMode: state.uiLanguageMode,
        lyricOriginal: state.lyricOriginal,
        lyricRomanization: state.lyricRomanization,
        lyricTranslation: state.lyricTranslation,
        lyricLatinOnly: state.lyricLatinOnly,
        lyricsTargetLanguage: state.lyricsTargetLanguage,
        animeSearchEnabled: state.animeSearchEnabled,
        videoclipsEnabled: state.videoclipsEnabled,
        autoCandidateResolution: state.autoCandidateResolution,
        resolutionProfile: state.resolutionProfile,
        cellularResolutionPolicy: state.cellularResolutionPolicy,
        editionPreference: state.editionPreference,
        mostDownloadedArtists: state.mostDownloadedArtists,
        preferredPlayerPackage: state.preferredPlayerPackage,
        autoDownload: state.autoDownload,
        downloadAudioFormat: state.downloadAudioFormat,
        allowLongAudioDownloads: state.allowLongAudioDownloads,
        appTheme: state.appTheme,
        videoQuality: state.videoQuality,
        videoCodec: state.videoCodec,
        videoDownloads: state.videoDownloads
          .filter((d) => d.status === 'completed' || d.status === 'error')
          .slice(0, 40),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      merge: (persisted: any, current) => {
        const theme = persisted?.appTheme || 'original_minimalist';
        applyThemeToDOM(theme);
        return {
          ...current,
          downloads: Array.isArray(persisted?.downloads) ? persisted.downloads : [],
          volume: persisted?.volume ?? 0.8,
          downloadFolderName: persisted?.downloadFolderName || '',
          uiLanguageMode: isUiLanguageMode(persisted?.uiLanguageMode)
            ? persisted.uiLanguageMode
            : isUiLanguageMode(persisted?.appLanguage)
              ? (persisted.appLanguage as Lang)
              : 'system',
          appTheme: theme,
          lyricOriginal: persisted?.lyricOriginal ?? true,
          lyricRomanization: persisted?.lyricRomanization ?? true,
          lyricTranslation: persisted?.lyricTranslation ?? true,
          lyricLatinOnly: persisted?.lyricLatinOnly ?? false,
          lyricsTargetLanguage: isLyricsTargetLanguage(persisted?.lyricsTargetLanguage)
            ? persisted.lyricsTargetLanguage
            : 'system',
          animeSearchEnabled: persisted?.animeSearchEnabled ?? false,
          videoclipsEnabled: persisted?.videoclipsEnabled ?? false,
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
          downloadAudioFormat:
            persisted?.downloadAudioFormat === 'mp3' || persisted?.downloadAudioFormat === 'm4a'
              ? persisted.downloadAudioFormat
              : 'm4a',
          allowLongAudioDownloads: Boolean(persisted?.allowLongAudioDownloads ?? false),
          videoQuality:
            persisted?.videoQuality === '720p' ||
            persisted?.videoQuality === '1080p' ||
            persisted?.videoQuality === 'best'
              ? persisted.videoQuality
              : '1080p',
          videoCodec:
            persisted?.videoCodec === 'av1' || persisted?.videoCodec === 'h264'
              ? persisted.videoCodec
              : 'av1',
          videoDownloads: Array.isArray(persisted?.videoDownloads)
            ? persisted.videoDownloads
            : [],
          _hasHydrated: true,
        };
      },
    }
  )
);
