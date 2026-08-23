import { Track, Download } from '@/types/music';
import { UiLanguageMode, LyricsTargetLanguage } from '@/lib/language';
import { EditionPreference } from '@/lib/download/candidateResolver';
import { AppThemeId } from '@/lib/themes/themeCatalog';

export type ResolutionProfile = 'adaptive' | 'economy';
export type CellularResolutionPolicy = 'off' | 'light' | 'full';

export interface PlayerSlice {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  progress: number;
  duration: number;
  dominantColor: string | null;

  playTrack: (track: Track) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  seekTo: (time: number) => void;
  setDominantColor: (color: string | null) => void;
}

export interface SearchSlice {
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  searchOffset: number;
  hasMoreResults: boolean;
  isLoadingMore: boolean;

  performSearch: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;
  setDirectTrack: (track: Track) => void;
  clearSearch: () => void;
}

export interface DownloadSlice {
  downloads: Download[];
  downloadQueue: string[];
  activeDownloads: number;
  downloadFolder: FileSystemDirectoryHandle | null;
  downloadFolderName: string;
  mostDownloadedArtists: string[];

  startDownload: (track: Track) => void;
  startDownloadWithVideoId: (track: Track, videoId: string) => void;
  startDownloadWithSourceUrl: (track: Track, sourceUrl: string) => void;
  removeDownload: (id: string) => void;
  processDownloadQueue: () => Promise<void>;
  _executeDownload: (
    track: Track,
    id: string,
    videoIdOverride?: string,
    sourceUrlOverride?: string,
  ) => Promise<void>;

  setDownloadFolder: (handle: FileSystemDirectoryHandle, name: string) => void;
  clearDownloadFolder: () => void;
  addMostDownloadedArtist: (artist: string) => void;
}

export interface SettingsSlice {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  uiLanguageMode: UiLanguageMode;
  preferredPlayerPackage: string | null;
  appTheme: AppThemeId;
  lyricOriginal: boolean;
  lyricRomanization: boolean;
  lyricTranslation: boolean;
  lyricLatinOnly: boolean;
  lyricsTargetLanguage: LyricsTargetLanguage;
  animeSearchEnabled: boolean;
  autoCandidateResolution: boolean;
  resolutionProfile: ResolutionProfile;
  cellularResolutionPolicy: CellularResolutionPolicy;
  editionPreference: EditionPreference;
  autoDownload: boolean;
  ytDlpVersion: string | null;
  ytDlpUpdateAvailable: boolean;
  ytDlpUpdating: boolean;

  setUiLanguageMode: (mode: UiLanguageMode) => void;
  setAppTheme: (theme: AppThemeId) => void;
  setPreferredPlayerPackage: (pkg: string | null) => void;
  setLyricOriginal: (v: boolean) => void;
  setLyricRomanization: (v: boolean) => void;
  setLyricTranslation: (v: boolean) => void;
  setLyricLatinOnly: (v: boolean) => void;
  setLyricsTargetLanguage: (v: LyricsTargetLanguage) => void;
  setAnimeSearchEnabled: (v: boolean) => void;
  setAutoCandidateResolution: (v: boolean) => void;
  setResolutionProfile: (v: ResolutionProfile) => void;
  setCellularResolutionPolicy: (v: CellularResolutionPolicy) => void;
  setEditionPreference: (v: EditionPreference) => void;
  setAutoDownload: (v: boolean) => void;
  setYtDlpVersion: (version: string | null) => void;
  setYtDlpUpdateAvailable: (v: boolean) => void;
  setYtDlpUpdating: (v: boolean) => void;
}

export interface MusicStore extends PlayerSlice, SearchSlice, DownloadSlice, SettingsSlice {}
