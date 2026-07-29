import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Anime, AnimeTheme } from '@/types/anime';

// Hoisted mocks must be declared before importing the SUT.
const { getDownloadCandidatesMock } = vi.hoisted(() => ({
  getDownloadCandidatesMock: vi.fn(),
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
  sequence: 2,
  title: 'Haruka Kanata',
  artist: 'Asian Kung-Fu Generation',
  episodesFrom: 26,
  episodesTo: 53,
  audioUrl: 'https://a.animethemes.moe/Naruto-OP2.ogg',
  videoUrl: 'https://v.animethemes.moe/Naruto-OP2.webm',
};

function clearPlatform(): void {
  window.history.replaceState({}, '', '/');
  delete (window as { pywebview?: unknown }).pywebview;
  delete (window as { androidBridge?: unknown }).androidBridge;
  delete (window as { Capacitor?: unknown }).Capacitor;
  __animeApiTesting.clearCaches();
  vi.restoreAllMocks();
  getDownloadCandidatesMock.mockReset();
}

function setPyWebViewPlatform(api: { anime_search: ReturnType<typeof vi.fn>; anime_get_themes: ReturnType<typeof vi.fn> }): void {
  (window as { pywebview?: unknown }).pywebview = { api };
}

function setAndroidPlatform(): void {
  (window as { androidBridge?: unknown }).androidBridge = {};
}

beforeEach(() => {
  clearPlatform();
});

afterEach(() => {
  clearPlatform();
});

describe('searchAnime', () => {
  it('rejects unsupported platforms without making a network request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await searchAnime('naruto', 5);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Unsupported platform' });
  });

  it('calls anime_search on the desktop bridge when running in pywebview', async () => {
    const animeSearch = vi.fn().mockResolvedValue({ success: true, results: [sampleAnime] });
    const animeGetThemes = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    const result = await searchAnime('naruto');

    expect(animeSearch).toHaveBeenCalledWith('naruto', 10);
    expect(result).toEqual({ success: true, results: [sampleAnime] });
  });

  it('strips opening keywords before calling the desktop bridge', async () => {
    const animeSearch = vi.fn().mockResolvedValue({ success: true, results: [sampleAnime] });
    const animeGetThemes = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    await searchAnime('naruto opening 1');

    expect(animeSearch).toHaveBeenCalledWith('naruto', 10);
  });

  it('searches AniList directly on android and strips opening keywords', async () => {
    setAndroidPlatform();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          Page: {
            media: [{
              id: 20,
              title: { romaji: 'Naruto', english: 'Naruto', native: null },
              coverImage: { large: 'cover.jpg' },
              format: 'TV',
              episodes: 220,
              startDate: { year: 2002 },
              description: '<b>Ninja</b> story',
            }],
          },
        },
      }), { status: 200 }),
    );

    const result = await searchAnime('naruto opening 1');

    expect(result.success).toBe(true);
    expect(result.results?.[0]).toMatchObject({ id: 20, type: 'TV', synopsis: 'Ninja story' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.variables.search).toBe('naruto');
  });

  it('caches the result and skips the next AniList request on Android', async () => {
    setAndroidPlatform();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          Page: {
            media: [{
              id: 20,
              title: { romaji: 'Naruto', english: 'Naruto', native: null },
              coverImage: { large: 'cover.jpg' },
              format: 'TV',
              episodes: 220,
              startDate: { year: 2002 },
              description: 'Ninja story',
            }],
          },
        },
      }), { status: 200 }),
    );

    const first = await searchAnime('naruto', 5);
    const second = await searchAnime('naruto', 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});

describe('getAnimeThemes', () => {
  it('rejects unsupported platforms without making a network request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await getAnimeThemes(20);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Unsupported platform' });
  });

  it('calls anime_get_themes on the desktop bridge when running in pywebview', async () => {
    const animeGetThemes = vi.fn().mockResolvedValue({ success: true, themes: [sampleTheme] });
    const animeSearch = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    const result = await getAnimeThemes(20);

    expect(animeGetThemes).toHaveBeenCalledWith(20);
    expect(result).toEqual({ success: true, themes: [sampleTheme] });
  });

  it('loads curated AnimeThemes REST metadata directly on android', async () => {
    setAndroidPlatform();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { Media: { title: { english: 'Naruto', romaji: 'Naruto' } } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        anime: [{ name: 'Naruto', slug: 'naruto' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        anime: {
          animethemes: [{
            type: 'OP',
            sequence: 2,
            song: {
              title: 'Haruka Kanata',
              artists: [{ name: 'Asian Kung-Fu Generation' }],
            },
            animethemeentries: [{
              episodes: '26-53',
              videos: [{
                link: sampleTheme.videoUrl,
                audio: { link: sampleTheme.audioUrl },
              }],
            }],
          }],
        },
      }), { status: 200 }));

    const result = await getAnimeThemes(20);

    expect(result).toEqual({ success: true, themes: [sampleTheme] });
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
  it('uses the original song identity and asks the user to select full audio', async () => {
    getDownloadCandidatesMock.mockResolvedValue([{
      videoId: 'full-song',
      title: 'Haruka Kanata',
      channel: 'Asian Kung-Fu Generation - Topic',
      duration: 244,
      score: 160,
    }]);

    const result = await downloadAnimeTheme(sampleTheme, 'Naruto', sampleAnime.cover);

    expect(result.sourceUrl).toBe(sampleTheme.audioUrl);
    expect(result.track).toEqual({
      id: 'anime-20-OP-2',
      title: 'Haruka Kanata',
      canonicalTitle: 'Haruka Kanata',
      artist: sampleTheme.artist,
      album: 'Naruto',
      canonicalAlbum: 'Naruto',
      duration: 0,
      cover: sampleAnime.cover,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('FULL_TRACK_SELECTION_REQUIRED');
    expect(getDownloadCandidatesMock).toHaveBeenCalledWith(result.track, true);
  });
});
