import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get, set as idbSet, del } from 'idb-keyval';
import { MusicStore } from './slices/types';
import { createPlayerSlice } from './slices/playerSlice';
import { createSearchSlice } from './slices/searchSlice';
import { createDownloadSlice } from './slices/downloadSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { audioEngine } from '@/lib/audioEngine';
import { isUiLanguageMode, isLyricsTargetLanguage, Lang } from '@/lib/language';

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await get(name);
      if (!value) {
        // Migración automática de LocalStorage a IndexedDB
        const lsValue = localStorage.getItem(name);
        if (lsValue) {
          await idbSet(name, lsValue);
          return lsValue; // No borramos localstorage aún, como fallback seguro
        }
        return null;
      }
      return value || null;
    } catch (e) {
      console.warn('IDB get falló', e);
      return localStorage.getItem(name);
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await idbSet(name, value);
    } catch (e) {
      console.error('IDB set falló', e);
      import('sonner').then(({ toast }) => {
        toast.error('No hay espacio en disco (o IDB corrupto). El historial no se guardará.', { duration: 10000 });
      }).catch(() => {});
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch (e) {
      console.warn('IDB del falló', e);
    }
  },
};

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get, api) => {
      audioEngine.onTimeUpdate = (time) => {
        if (get()._hasHydrated) set({ progress: time });
      };

      audioEngine.onCanPlay = () => {
        if (get()._hasHydrated) set({
          isLoading: false,
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onLoadedMetadata = () => {
        if (get()._hasHydrated) set({
          duration: audioEngine.duration || get().currentTrack?.duration || 0,
        });
      };

      audioEngine.onWaiting = () => {
        if (get()._hasHydrated && get().currentTrack) set({ isLoading: true });
      };

      audioEngine.onStalled = () => {
        if (get()._hasHydrated && get().isPlaying) set({ isLoading: true });
      };

      audioEngine.onPlaying = () => {
        if (get()._hasHydrated) set({ isPlaying: true, isLoading: false });
      };
      audioEngine.onPause = () => {
        if (get()._hasHydrated) set({ isPlaying: false, isLoading: false });
      };
      audioEngine.onEnded = () => {
        if (get()._hasHydrated) set({ isPlaying: false, progress: 0 });
      };

      return {
        ...createPlayerSlice(set, get, api),
        ...createSearchSlice(set, get, api),
        ...createDownloadSlice(set, get, api),
        ...createSettingsSlice(set, get, api),
      };
    },
    {
      name: 'mhl-store',
      storage: createJSONStorage(() => idbStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHasHydrated(true);
      },
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
        downloads: Array.isArray(persisted?.downloads) ? persisted.downloads : [],
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
