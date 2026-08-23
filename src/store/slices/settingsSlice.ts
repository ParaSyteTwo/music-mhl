import { StateCreator } from 'zustand';
import { MusicStore, SettingsSlice } from './types';
import { applyThemeToDOM, DEFAULT_THEME_ID, AppThemeId } from '@/lib/themes/themeCatalog';

export const createSettingsSlice: StateCreator<
  MusicStore,
  [],
  [],
  SettingsSlice
> = (set) => ({
  _hasHydrated: false,
  setHasHydrated: (state) => set({ _hasHydrated: state }),
  uiLanguageMode: 'system',
  setUiLanguageMode: (mode) => set({ uiLanguageMode: mode }),
  appTheme: DEFAULT_THEME_ID,
  setAppTheme: (theme: AppThemeId) => {
    applyThemeToDOM(theme);
    set({ appTheme: theme });
  },

  lyricOriginal: true,
  lyricRomanization: true,
  lyricTranslation: true,
  lyricLatinOnly: false,
  lyricsTargetLanguage: 'system',
  setLyricOriginal: (v) => set({ lyricOriginal: v }),
  setLyricRomanization: (v) => set({ lyricRomanization: v }),
  setLyricTranslation: (v) => set({ lyricTranslation: v }),
  setLyricLatinOnly: (v) => set({ lyricLatinOnly: v }),
  setLyricsTargetLanguage: (v) => set({ lyricsTargetLanguage: v }),

  animeSearchEnabled: false,
  setAnimeSearchEnabled: (v) => set({ animeSearchEnabled: v }),
  autoCandidateResolution: true,
  resolutionProfile: 'adaptive',
  cellularResolutionPolicy: 'light',
  editionPreference: 'catalog',
  setAutoCandidateResolution: (v) => set({ autoCandidateResolution: v }),
  setResolutionProfile: (v) => set({ resolutionProfile: v }),
  setCellularResolutionPolicy: (v) => set({ cellularResolutionPolicy: v }),
  setEditionPreference: (v) => set({ editionPreference: v }),

  autoDownload: true,
  setAutoDownload: (v) => set({ autoDownload: v }),

  allowLongAudioDownloads: false,
  setAllowLongAudioDownloads: (v) => set({ allowLongAudioDownloads: v }),

  preferredPlayerPackage: null,
  setPreferredPlayerPackage: (pkg) => set({ preferredPlayerPackage: pkg }),

  ytDlpVersion: null,
  ytDlpUpdateAvailable: false,
  ytDlpUpdating: false,
  setYtDlpVersion: (version) => set({ ytDlpVersion: version }),
  setYtDlpUpdateAvailable: (v) => set({ ytDlpUpdateAvailable: v }),
  setYtDlpUpdating: (v) => set({ ytDlpUpdating: v }),
});
