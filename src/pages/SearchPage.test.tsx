import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedCollection, Track } from '@/types/music';

const storeState: {
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  performSearch: ReturnType<typeof vi.fn>;
  loadMoreResults: ReturnType<typeof vi.fn>;
  hasMoreResults: boolean;
  isLoadingMore: boolean;
  playTrack: ReturnType<typeof vi.fn>;
  currentTrack: Track | null;
  isPlaying: boolean;
  startDownload: ReturnType<typeof vi.fn>;
  startDownloadWithVideoId: ReturnType<typeof vi.fn>;
  startDownloadWithSourceUrl: ReturnType<typeof vi.fn>;
  startBatchDownload: ReturnType<typeof vi.fn>;
  downloads: [];
  mostDownloadedArtists: string[];
  animeSearchEnabled: boolean;
  allowLongAudioDownloads: boolean;
  setDirectTrack: ReturnType<typeof vi.fn>;
  clearSearch: ReturnType<typeof vi.fn>;
} = {
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  performSearch: vi.fn(),
  loadMoreResults: vi.fn(),
  hasMoreResults: false,
  isLoadingMore: false,
  playTrack: vi.fn(),
  currentTrack: null,
  isPlaying: false,
  startDownload: vi.fn(),
  startDownloadWithVideoId: vi.fn(),
  startDownloadWithSourceUrl: vi.fn(),
  startBatchDownload: vi.fn(() => ({ queued: 2, skipped: 0, truncated: false })),
  downloads: [],
  mostDownloadedArtists: [],
  animeSearchEnabled: false,
  allowLongAudioDownloads: false,
  setDirectTrack: vi.fn(),
  clearSearch: vi.fn(),
};
const translate = (key: string) => key;

vi.mock('@/store/musicStore', () => ({
  useMusicStore: () => storeState,
}));

vi.mock('@/lib/useI18n', () => ({
  useI18n: () => ({ t: translate }),
}));

vi.mock('@/lib/api/musicApi', () => ({
  getDownloadCandidates: vi.fn().mockResolvedValue([]),
}));

const searchAnimeMock = vi.fn();
const getAnimeThemesMock = vi.fn();
const downloadAnimeThemeMock = vi.fn();

vi.mock('@/lib/api/animeApi', () => ({
  searchAnime: (...args: unknown[]) => searchAnimeMock(...args),
  getAnimeThemes: (...args: unknown[]) => getAnimeThemesMock(...args),
  downloadAnimeTheme: (...args: unknown[]) => downloadAnimeThemeMock(...args),
}));

const resolveCollectionFromUrlMock = vi.fn();
const resolveDeezerAlbumByIdMock = vi.fn();

vi.mock('@/lib/music/collectionResolver', () => ({
  resolveCollectionFromUrl: (...args: unknown[]) => resolveCollectionFromUrlMock(...args),
  resolveDeezerAlbumById: (...args: unknown[]) => resolveDeezerAlbumByIdMock(...args),
}));

vi.mock('@/data/globalArtists', () => ({
  GLOBAL_ARTISTS_POOL: ['Bad Bunny', 'Taylor Swift'],
  buildAffinityPool: () => ['Bad Bunny', 'Taylor Swift'],
  buildArtistVisuals: () => [
    { name: 'Bad Bunny', primary: '#C8F04B', secondary: '#4BE0A8', glow: '#C8F04B35' },
    { name: 'Taylor Swift', primary: '#FF7DB2', secondary: '#FF9E64', glow: '#FF7DB235' },
  ],
  artistGenre: (name: string) => (name === 'Bad Bunny' ? 'reggaeton' : 'pop'),
}));

import SearchPage from './SearchPage';

const SAMPLE_COLLECTION: ResolvedCollection = {
  id: 'deezer-album-302127',
  type: 'album',
  source: 'deezer',
  title: 'Discovery',
  subtitle: 'Daft Punk',
  cover: 'https://example.com/discovery.jpg',
  totalTracks: 2,
  truncated: false,
  tracks: [
    {
      id: 'dz-3135556',
      deezerId: 3135556,
      albumId: 302127,
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      duration: 320,
      cover: 'https://example.com/discovery.jpg',
    },
    {
      id: 'dz-3135557',
      deezerId: 3135557,
      albumId: 302127,
      title: 'Aerodynamic',
      artist: 'Daft Punk',
      album: 'Discovery',
      duration: 212,
      cover: 'https://example.com/discovery.jpg',
    },
  ],
};

describe('SearchPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    storeState.searchQuery = '';
    storeState.searchResults = [];
    storeState.isSearching = false;
    storeState.animeSearchEnabled = false;
    storeState.startBatchDownload.mockReturnValue({ queued: 2, skipped: 0, truncated: false });
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  it('mounts without accessing recent-search callbacks before initialization', () => {
    const { container } = render(<SearchPage />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it('renders modern artist discovery cards with genre badges when empty', () => {
    const { getByText } = render(<SearchPage />);
    expect(getByText('Bad Bunny')).toBeInTheDocument();
    expect(getByText('Taylor Swift')).toBeInTheDocument();
    expect(getByText('genre_reggaeton')).toBeInTheDocument();
    expect(getByText('genre_pop')).toBeInTheDocument();
  });

  it('keeps anime mode disabled by default even for anime-like queries', async () => {
    const { getByPlaceholderText } = render(<SearchPage />);
    const input = getByPlaceholderText('searchPlaceholder');

    fireEvent.change(input, { target: { value: 'naruto opening 1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(storeState.performSearch).toHaveBeenCalledWith('naruto opening 1');
    });
    expect(searchAnimeMock).not.toHaveBeenCalled();
  });

  it('resolves a pasted supported collection URL and renders CollectionPanel', async () => {
    resolveCollectionFromUrlMock.mockResolvedValueOnce(SAMPLE_COLLECTION);

    const { getByPlaceholderText, getByText } = render(<SearchPage />);
    const input = getByPlaceholderText('searchPlaceholder');

    const albumUrl = 'https://www.deezer.com/album/302127';
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => albumUrl,
      },
    });

    await waitFor(() => {
      expect(resolveCollectionFromUrlMock).toHaveBeenCalledWith(albumUrl);
    });

    await waitFor(() => {
      expect(getByText('Discovery')).toBeInTheDocument();
      expect(getByText('One More Time')).toBeInTheDocument();
      expect(getByText('Aerodynamic')).toBeInTheDocument();
    });

    const downloadAllBtn = getByText('collectionDownloadAll').closest('button');
    expect(downloadAllBtn).not.toBeNull();
    fireEvent.click(downloadAllBtn!);
    expect(storeState.startBatchDownload).toHaveBeenCalledWith(SAMPLE_COLLECTION.tracks);
  });

  it('opens CollectionPanel when clicking viewAlbum on a search result with albumId', async () => {
    storeState.searchQuery = 'Daft Punk';
    storeState.searchResults = [SAMPLE_COLLECTION.tracks[0]];
    resolveDeezerAlbumByIdMock.mockResolvedValueOnce(SAMPLE_COLLECTION);

    const { getAllByLabelText, getByText } = render(<SearchPage />);
    const albumButtons = getAllByLabelText('viewAlbum');
    expect(albumButtons.length).toBeGreaterThan(0);

    fireEvent.click(albumButtons[0]);

    await waitFor(() => {
      expect(resolveDeezerAlbumByIdMock).toHaveBeenCalledWith(302127);
    });
    await waitFor(() => {
      expect(getByText('Discovery')).toBeInTheDocument();
      expect(getByText('Aerodynamic')).toBeInTheDocument();
    });
  });

  it('enqueues a single Deezer track from CollectionPanel via startBatchDownload instead of startDownload', async () => {
    resolveCollectionFromUrlMock.mockResolvedValueOnce(SAMPLE_COLLECTION);

    const { getByPlaceholderText, getByLabelText, getByText } = render(<SearchPage />);
    const input = getByPlaceholderText('searchPlaceholder');

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => 'https://www.deezer.com/album/302127',
      },
    });

    await waitFor(() => {
      expect(getByText('One More Time')).toBeInTheDocument();
    });

    const singleTrackBtn = getByLabelText('animeThemesDownload One More Time');
    fireEvent.click(singleTrackBtn);

    expect(storeState.startBatchDownload).toHaveBeenCalledWith([SAMPLE_COLLECTION.tracks[0]]);
    expect(storeState.startDownload).not.toHaveBeenCalled();
  });

  it('exits anime mode cleanly on handleAnimeModeToggle without looping back into searchAnime', async () => {
    storeState.animeSearchEnabled = true;
    searchAnimeMock.mockResolvedValue({
      success: true,
      results: [
        {
          id: 20,
          titleRomaji: 'Naruto',
          titleEnglish: 'Naruto',
          titleNative: 'ナルト',
          cover: 'https://example.com/naruto.jpg',
          type: 'TV',
          episodes: 220,
          year: 2002,
          synopsis: 'Ninja story',
        },
      ],
    });

    const { getByPlaceholderText, getByText, queryByText } = render(<SearchPage />);
    const input = getByPlaceholderText('searchPlaceholder');

    fireEvent.change(input, { target: { value: 'naruto opening 1' } });

    await waitFor(() => {
      expect(searchAnimeMock).toHaveBeenCalledTimes(1);
      expect(getByText('animeModeActive')).toBeInTheDocument();
    });

    const toggleBtn = getByText('animeModeActive').closest('button');
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn!);

    await waitFor(() => {
      expect(storeState.performSearch).toHaveBeenCalledWith('naruto opening 1');
      expect(queryByText('animeModeActive')).not.toBeInTheDocument();
    });

    // Wait longer than the 200ms anime debounce to ensure it does NOT loop back into anime mode
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(searchAnimeMock).toHaveBeenCalledTimes(1);
    expect(queryByText('animeModeActive')).not.toBeInTheDocument();
  });

  it('does not trigger anime mode or destroy CollectionPanel when pasting a playlist URL with anime keywords', async () => {
    storeState.animeSearchEnabled = true;
    const ytAnimeCollection: ResolvedCollection = {
      id: 'youtube-playlist-PL_anime_opening_123',
      type: 'playlist',
      source: 'youtube',
      title: 'Anime Openings Mix',
      subtitle: 'YouTube',
      cover: 'https://example.com/yt.jpg',
      totalTracks: 1,
      truncated: false,
      tracks: [
        {
          id: 'yt_abc12345678',
          youtubeId: 'abc12345678',
          title: 'Gurenge',
          artist: 'LiSA',
          album: 'Anime Openings Mix',
          duration: 237,
          cover: 'https://example.com/yt.jpg',
        },
      ],
    };
    resolveCollectionFromUrlMock.mockResolvedValueOnce(ytAnimeCollection);

    const { getByPlaceholderText, getByText } = render(<SearchPage />);
    const input = getByPlaceholderText('searchPlaceholder');
    const url = 'https://www.youtube.com/playlist?list=PL_anime_opening_123';

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => url,
      },
    });

    await waitFor(() => {
      expect(getByText('Anime Openings Mix')).toBeInTheDocument();
    });

    // Wait past both anime (200ms) and URL (300ms) debounce windows
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(resolveCollectionFromUrlMock).toHaveBeenCalledTimes(1);
    expect(searchAnimeMock).not.toHaveBeenCalled();
    expect(getByText('Anime Openings Mix')).toBeInTheDocument();
  });
});
