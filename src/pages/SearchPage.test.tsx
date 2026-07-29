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
  startDownloadWithVideoId: vi.fn(),
  startDownloadWithSourceUrl: vi.fn(),
  downloads: [],
  mostDownloadedArtists: [],
  animeSearchEnabled: false,
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
  GLOBAL_ARTISTS_POOL: [],
  buildAffinityPool: () => [],
  buildArtistVisuals: () => [],
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
});
