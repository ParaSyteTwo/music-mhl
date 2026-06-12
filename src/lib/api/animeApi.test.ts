import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Anime, AnimeTheme } from '@/types/anime';

// Hoisted mocks must be declared before importing the SUT.
const { startDownloadWithVideoIdMock, getDownloadCandidatesMock } = vi.hoisted(() => ({
  startDownloadWithVideoIdMock: vi.fn(),
  getDownloadCandidatesMock: vi.fn(),
}));

vi.mock('@/store/musicStore', () => ({
  useMusicStore: {
    getState: () => ({
      startDownloadWithVideoId: startDownloadWithVideoIdMock,
    }),
  },
}));

vi.mock('@/lib/api/musicApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/musicApi')>('@/lib/api/musicApi');
  return {
    ...actual,
    getDownloadCandidates: getDownloadCandidatesMock,
  };
});

import { __animeApiTesting, downloadAnimeTheme, getAnimeThemes, searchAnime } from './animeApi';

const sampleAnime: Anime = {
  id: 20,
  titleRomaji: 'Naruto',
  titleEnglish: 'Naruto',
  titleNative: 'NARUTO -ナルト-',
  cover: 'https://example.com/naruto.jpg',
  type: 'TV',
  episodes: 220,
  year: 2002,
  synopsis: 'A young ninja seeks recognition.',
};

const sampleTheme: AnimeTheme = {
  animeId: 20,
  type: 'OP',
  sequence: 1,
  title: 'Haruka Kanata',
  artist: 'Asian Kung-Fu Generation',
  episodesFrom: 1,
  episodesTo: 25,
  videoId: 'dQw4w9WgXcQ',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

function clearPlatform(): void {
  window.history.replaceState({}, '', '/');
  delete (window as { pywebview?: unknown }).pywebview;
  delete (window as { androidBridge?: unknown }).androidBridge;
  delete (window as { Capacitor?: unknown }).Capacitor;
  __animeApiTesting.clearCaches();
  vi.restoreAllMocks();
  startDownloadWithVideoIdMock.mockReset();
  getDownloadCandidatesMock.mockReset();
}

function setWebEnv(): void {
  (import.meta.env as Record<string, string | undefined>).VITE_RAILWAY_URL = 'https://railway.test';
  (import.meta.env as Record<string, string | undefined>).VITE_SERVICE_API_KEY = 'test-key';
}

function setPyWebViewPlatform(api: { anime_search: ReturnType<typeof vi.fn>; anime_get_themes: ReturnType<typeof vi.fn> }): void {
  (window as { pywebview?: unknown }).pywebview = { api };
}

function setAndroidPlatform(): void {
  (window as { androidBridge?: unknown }).androidBridge = {};
}

beforeEach(() => {
  clearPlatform();
  setWebEnv();
});

afterEach(() => {
  clearPlatform();
});

describe('searchAnime', () => {
  it('calls fetch with the right URL on web', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [sampleAnime] }), { status: 200 }),
    );

    const result = await searchAnime('naruto', 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://railway.test/anime/search');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ query: 'naruto', limit: 5 });
    expect(result).toEqual({ success: true, results: [sampleAnime] });
  });

  it('calls anime_search on the desktop bridge when running in pywebview', async () => {
    const animeSearch = vi.fn().mockResolvedValue({ success: true, results: [sampleAnime] });
    const animeGetThemes = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    const result = await searchAnime('naruto');

    expect(animeSearch).toHaveBeenCalledWith('naruto', 10);
    expect(result).toEqual({ success: true, results: [sampleAnime] });
  });

  it('returns UNSUPPORTED_PLATFORM on android', async () => {
    setAndroidPlatform();

    const result = await searchAnime('naruto');

    expect(result).toEqual({ success: false, error: 'UNSUPPORTED_PLATFORM' });
  });

  it('returns Unauthorized when the backend responds 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    const result = await searchAnime('naruto', 5);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('caches the result and skips the next fetch on web', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [sampleAnime] }), { status: 200 }),
    );

    const first = await searchAnime('naruto', 5);
    const second = await searchAnime('naruto', 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});

describe('getAnimeThemes', () => {
  it('calls fetch on web with the anilistId in the body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ themes: [sampleTheme] }), { status: 200 }),
    );

    const result = await getAnimeThemes(20);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://railway.test/anime/themes');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ anilistId: 20 });
    expect(result).toEqual({ success: true, themes: [sampleTheme] });
  });

  it('calls anime_get_themes on the desktop bridge when running in pywebview', async () => {
    const animeGetThemes = vi.fn().mockResolvedValue({ success: true, themes: [sampleTheme] });
    const animeSearch = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    const result = await getAnimeThemes(20);

    expect(animeGetThemes).toHaveBeenCalledWith(20);
    expect(result).toEqual({ success: true, themes: [sampleTheme] });
  });

  it('returns UNSUPPORTED_PLATFORM on android', async () => {
    setAndroidPlatform();

    const result = await getAnimeThemes(20);

    expect(result).toEqual({ success: false, error: 'UNSUPPORTED_PLATFORM' });
  });

  it.each([0, -1, Number.NaN, 1.5])(
    'rejects invalid anilistId %s without calling fetch or the bridge',
    async (badId) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      const animeGetThemes = vi.fn();
      setPyWebViewPlatform({ anime_search: vi.fn(), anime_get_themes: animeGetThemes });

      const result = await getAnimeThemes(badId);

      expect(result).toEqual({ success: false, error: 'Invalid anilistId' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(animeGetThemes).not.toHaveBeenCalled();
    },
  );
});

describe('downloadAnimeTheme', () => {
  it('builds a virtual track and triggers startDownloadWithVideoId', async () => {
    const result = await downloadAnimeTheme(sampleTheme, 'Naruto');

    expect(startDownloadWithVideoIdMock).toHaveBeenCalledTimes(1);
    const [track, videoId] = startDownloadWithVideoIdMock.mock.calls[0];
    expect(videoId).toBe(sampleTheme.videoId);
    expect(track).toEqual({
      id: 'anime-20-OP-1',
      title: 'Naruto OP 1',
      artist: sampleTheme.artist,
      album: 'Naruto',
      duration: 0,
      cover: '',
      youtubeId: sampleTheme.videoId,
    });
    expect(result.success).toBe(true);
    expect(result.videoId).toBe(sampleTheme.videoId);
  });
});
