import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
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
  downloads: [],
  mostDownloadedArtists: [],
  animeSearchEnabled: false,
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

vi.mock('@/lib/api/animeApi', () => ({
  searchAnime: vi.fn(),
  getAnimeThemes: vi.fn(),
  downloadAnimeTheme: vi.fn(),
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

describe('SearchPage', () => {
  beforeEach(() => {
    localStorage.clear();
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
});

