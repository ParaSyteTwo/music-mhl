import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Anime, AnimeSeason, AnimeTheme } from '@/types/anime';
import type { DownloadCandidate } from '@/lib/api/musicApi';

// Hoisted mocks must be declared before importing the SUT.
const { getDownloadCandidatesMock, searchDeezerMock } = vi.hoisted(() => ({
  getDownloadCandidatesMock: vi.fn(),
  searchDeezerMock: vi.fn(),
}));

vi.mock('@/lib/api/musicApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/musicApi')>('@/lib/api/musicApi');
  return {
    ...actual,
    getDownloadCandidates: getDownloadCandidatesMock,
    searchDeezer: searchDeezerMock,
  };
});

import {
  __animeApiTesting,
  downloadAnimeTheme,
  getAnimeThemes,
  parseJikanThemeEntry,
  searchAnime,
} from './animeApi';

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

function makeVerifiedCandidate(overrides: Partial<DownloadCandidate> = {}): DownloadCandidate {
  return {
    videoId: 'yt-verified-1',
    title: 'Haruka Kanata',
    channel: 'ASIAN KUNG-FU GENERATION - Topic',
    duration: 244,
    source: 'youtube_music',
    edition: 'unknown',
    verification: 'verified',
    evidence: {
      isrcMatch: false,
      titleMatch: true,
      artistMatch: true,
      albumMatch: false,
      durationDifference: 0.01,
      official: true,
      youtubeMusicSong: true,
      editionMatch: null,
      contradictions: [],
    },
    rejectionReasons: [],
    score: 850,
    confidence: 'alta',
    ...overrides,
  };
}

function clearPlatform(): void {
  window.history.replaceState({}, '', '/');
  delete (window as { pywebview?: unknown }).pywebview;
  delete (window as { androidBridge?: unknown }).androidBridge;
  delete (window as { Capacitor?: unknown }).Capacitor;
  __animeApiTesting.clearCaches();
  vi.restoreAllMocks();
  getDownloadCandidatesMock.mockReset();
  searchDeezerMock.mockReset();
  searchDeezerMock.mockResolvedValue([]);
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

describe('parseJikanThemeEntry', () => {
  it('parses numbered MAL theme entries with kanji subtitle and episode range', () => {
    expect(parseJikanThemeEntry('1: "Gurenge (紅蓮華)" by LiSA (eps 1-26)', 'OP', 1)).toEqual({
      type: 'OP',
      sequence: 1,
      title: 'Gurenge',
      artist: 'LiSA',
      episodesFrom: 1,
      episodesTo: 26,
    });
  });

  it('parses unnumbered theme entries without episode range', () => {
    expect(parseJikanThemeEntry('"Idol" by YOASOBI', 'OP', 1)).toEqual({
      type: 'OP',
      sequence: 1,
      title: 'Idol',
      artist: 'YOASOBI',
      episodesFrom: null,
      episodesTo: null,
    });
  });

  it('parses single episode entries and strips artist native duplicate parentheticals', () => {
    expect(parseJikanThemeEntry('2: "KICK BACK" by Kenshi Yonezu (米津玄師) (ep 1)', 'OP', 2)).toEqual({
      type: 'OP',
      sequence: 2,
      title: 'KICK BACK',
      artist: 'Kenshi Yonezu',
      episodesFrom: 1,
      episodesTo: 1,
    });
  });

  it('handles multi-segment episode ranges and trailing bracket labels', () => {
    expect(parseJikanThemeEntry('3: "Unravel" by TK from Ling Tosite Sigure (eps 1-11, 12) [TV Size]', 'ED', 3)).toEqual({
      type: 'ED',
      sequence: 3,
      title: 'Unravel',
      artist: 'TK from Ling Tosite Sigure',
      episodesFrom: 1,
      episodesTo: 12,
    });
  });

  it('cleans [Broadcast]/[TV] suffixes, preserves (feat. 誰か), and leaves episodesTo null for open ranges', () => {
    expect(
      parseJikanThemeEntry('1: "SPECIALZ" by King Gnu (feat. 誰か) [Broadcast] (episodes 1-)', 'OP', 1),
    ).toEqual({
      type: 'OP',
      sequence: 1,
      title: 'SPECIALZ',
      artist: 'King Gnu (feat. 誰か)',
      episodesFrom: 1,
      episodesTo: null,
    });

    expect(
      parseJikanThemeEntry('2: "Ao no Sumika" by Tatsuya Kitani (ep 1-) [TV]', 'OP', 2),
    ).toEqual({
      type: 'OP',
      sequence: 2,
      title: 'Ao no Sumika',
      artist: 'Tatsuya Kitani',
      episodesFrom: 1,
      episodesTo: null,
    });
  });
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

  it('calls anime_get_themes on the desktop bridge and preserves seasons when present', async () => {
    const sampleSeason: AnimeSeason = {
      anilistId: 20,
      malId: 20,
      seasonNumber: 1,
      titleRomaji: 'Naruto',
      titleEnglish: 'Naruto',
      year: 2002,
      episodes: 220,
      cover: 'https://example.com/naruto.jpg',
      themes: [sampleTheme],
    };
    const animeGetThemes = vi.fn().mockResolvedValue({
      success: true,
      themes: [sampleTheme],
      seasons: [sampleSeason],
    });
    const animeSearch = vi.fn();
    setPyWebViewPlatform({ anime_search: animeSearch, anime_get_themes: animeGetThemes });

    const result = await getAnimeThemes(20);

    expect(animeGetThemes).toHaveBeenCalledWith(20);
    expect(result).toEqual({ success: true, themes: [sampleTheme], seasons: [sampleSeason] });
  });

  it('stays backward compatible on desktop bridge when seasons field is omitted', async () => {
    const animeGetThemes = vi.fn().mockResolvedValue({ success: true, themes: [sampleTheme] });
    setPyWebViewPlatform({ anime_search: vi.fn(), anime_get_themes: animeGetThemes });

    const result = await getAnimeThemes(20);

    expect(result).toEqual({ success: true, themes: [sampleTheme] });
  });

  it('loads curated AnimeThemes REST metadata directly on android even with minimal AniList mock', async () => {
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

    expect(result.success).toBe(true);
    expect(result.themes).toHaveLength(1);
    expect(result.themes?.[0]).toMatchObject({
      ...sampleTheme,
      seasonNumber: 1,
      seasonTitle: 'Naruto',
      malId: null,
    });
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons?.[0].seasonNumber).toBe(1);
  });

  it('traverses TV PREQUEL/SEQUEL chains chronologically and loads Jikan primary + AnimeThemes fallback on android', async () => {
    setAndroidPlatform();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('graphql.anilist.co')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { variables?: { id?: number } };
        const id = body.variables?.id;
        if (id === 200) {
          // User selected Season 2 -> has PREQUEL (100, TV) and a MOVIE relation (ignored)
          return new Response(JSON.stringify({
            data: {
              Media: {
                id: 200,
                idMal: 40002,
                title: { romaji: 'Kimetsu no Yaiba: Yuukaku-hen', english: 'Demon Slayer S2' },
                format: 'TV',
                episodes: 11,
                startDate: { year: 2021 },
                coverImage: { extraLarge: 'https://img/s2.jpg' },
                relations: {
                  edges: [
                    {
                      relationType: 'PREQUEL',
                      node: {
                        id: 100,
                        idMal: 38000,
                        title: { romaji: 'Kimetsu no Yaiba', english: 'Demon Slayer' },
                        format: 'TV',
                        episodes: 26,
                        startDate: { year: 2019 },
                        coverImage: { large: 'https://img/s1.jpg' },
                      },
                    },
                    {
                      relationType: 'PREQUEL',
                      node: {
                        id: 150,
                        idMal: 40456,
                        title: { romaji: 'Mugen Train Movie', english: 'Mugen Train' },
                        format: 'MOVIE',
                        episodes: 1,
                        startDate: { year: 2020 },
                        coverImage: { large: 'https://img/movie.jpg' },
                      },
                    },
                  ],
                },
              },
            },
          }), { status: 200 });
        }
        if (id === 100) {
          // Season 1 links back to 200 (cycle test!)
          return new Response(JSON.stringify({
            data: {
              Media: {
                id: 100,
                idMal: 38000,
                title: { romaji: 'Kimetsu no Yaiba', english: 'Demon Slayer' },
                format: 'TV',
                episodes: 26,
                startDate: { year: 2019 },
                coverImage: { large: 'https://img/s1.jpg' },
                relations: {
                  edges: [
                    {
                      relationType: 'SEQUEL',
                      node: {
                        id: 200,
                        idMal: 40002,
                        title: { romaji: 'Kimetsu no Yaiba: Yuukaku-hen', english: 'Demon Slayer S2' },
                        format: 'TV',
                        episodes: 11,
                        startDate: { year: 2021 },
                        coverImage: { extraLarge: 'https://img/s2.jpg' },
                      },
                    },
                  ],
                },
              },
            },
          }), { status: 200 });
        }
      }

      // Jikan succeeds for Season 1 (malId=38000)
      if (url.includes('api.jikan.moe/v4/anime/38000/themes')) {
        return new Response(JSON.stringify({
          data: {
            openings: ['1: "Gurenge (紅蓮華)" by LiSA (eps 1-26)'],
            endings: ['1: "from the edge" by FictionJunction feat. LiSA (eps 2-18)'],
          },
        }), { status: 200 });
      }

      // Jikan fails (429) for Season 2 (malId=40002) -> triggers AnimeThemes external_id fallback
      if (url.includes('api.jikan.moe/v4/anime/40002/themes')) {
        return new Response('', { status: 429 });
      }

      if (url.includes('api.animethemes.moe/anime') && url.includes('filter%5Bexternal_id%5D=200')) {
        return new Response(JSON.stringify({
          anime: [{
            name: 'Kimetsu no Yaiba: Yuukaku-hen',
            slug: 'kimetsu-no-yaiba-yuukaku-hen',
            animethemes: [{
              type: 'OP',
              sequence: 1,
              song: {
                title: 'Zankyosanka',
                artists: [{ name: 'Aimer' }],
              },
              animethemeentries: [{
                episodes: '1-11',
                videos: [{
                  link: 'https://v.animethemes.moe/zankyosanka.webm',
                  audio: { link: 'https://a.animethemes.moe/zankyosanka.ogg' },
                }],
              }],
            }],
          }],
        }), { status: 200 });
      }

      return new Response('{}', { status: 404 });
    });

    const result = await getAnimeThemes(200);

    expect(result.success).toBe(true);
    expect(result.seasons).toHaveLength(2);
    expect(result.seasons?.[0]).toMatchObject({
      anilistId: 100,
      malId: 38000,
      seasonNumber: 1,
      titleEnglish: 'Demon Slayer',
    });
    expect(result.seasons?.[1]).toMatchObject({
      anilistId: 200,
      malId: 40002,
      seasonNumber: 2,
      titleEnglish: 'Demon Slayer S2',
    });
    expect(result.themes).toHaveLength(3);
    expect(result.themes?.[0]).toMatchObject({
      title: 'Gurenge',
      artist: 'LiSA',
      seasonNumber: 1,
      malId: 38000,
    });
    expect(result.themes?.[2]).toMatchObject({
      title: 'Zankyosanka',
      artist: 'Aimer',
      seasonNumber: 2,
      malId: 40002,
      audioUrl: 'https://a.animethemes.moe/zankyosanka.ogg',
    });
  });

  it('retries Jikan once on HTTP 429 respecting Retry-After before falling back', async () => {
    setAndroidPlatform();
    let jikanAttempts = 0;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('graphql.anilist.co')) {
        return new Response(JSON.stringify({
          data: {
            Media: {
              id: 500,
              idMal: 50000,
              title: { romaji: 'Frieren', english: 'Frieren' },
              format: 'TV',
              episodes: 28,
              startDate: { year: 2023 },
              coverImage: { large: 'https://img/frieren.jpg' },
              relations: { edges: [] },
            },
          },
        }), { status: 200 });
      }
      if (url.includes('api.jikan.moe/v4/anime/50000/themes')) {
        jikanAttempts += 1;
        if (jikanAttempts === 1) {
          return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
        }
        return new Response(JSON.stringify({
          data: {
            openings: ['1: "Yuusha" by YOASOBI (eps 1-16)'],
            endings: [],
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const result = await getAnimeThemes(500);

    expect(jikanAttempts).toBe(2);
    expect(result.success).toBe(true);
    expect(result.themes).toHaveLength(1);
    expect(result.themes?.[0]).toMatchObject({ title: 'Yuusha', artist: 'YOASOBI' });
    // Should NOT have called AnimeThemes because Jikan succeeded on retry
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('animethemes.moe'))).toBe(false);
  });

  it('traverses TV -> MOVIE -> TV bridge chains and returns both TV seasons chronologically', async () => {
    setAndroidPlatform();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('graphql.anilist.co')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { variables?: { id?: number } };
        const id = body.variables?.id;
        if (id === 1001) {
          return new Response(JSON.stringify({
            data: {
              Media: {
                id: 1001,
                idMal: 10001,
                title: { romaji: 'Bridge Anime S1', english: 'Bridge Anime S1' },
                format: 'TV',
                episodes: 26,
                startDate: { year: 2019 },
                coverImage: { large: 'https://img/b1.jpg' },
                relations: {
                  edges: [
                    {
                      relationType: 'SEQUEL',
                      node: {
                        id: 1002,
                        idMal: 10002,
                        title: { romaji: 'Bridge Movie', english: 'Bridge Movie' },
                        format: 'MOVIE',
                        episodes: 1,
                        startDate: { year: 2020 },
                        coverImage: { large: 'https://img/bm.jpg' },
                      },
                    },
                  ],
                },
              },
            },
          }), { status: 200 });
        }
        if (id === 1002) {
          return new Response(JSON.stringify({
            data: {
              Media: {
                id: 1002,
                idMal: 10002,
                title: { romaji: 'Bridge Movie', english: 'Bridge Movie' },
                format: 'MOVIE',
                episodes: 1,
                startDate: { year: 2020 },
                coverImage: { large: 'https://img/bm.jpg' },
                relations: {
                  edges: [
                    {
                      relationType: 'PREQUEL',
                      node: {
                        id: 1001,
                        idMal: 10001,
                        title: { romaji: 'Bridge Anime S1', english: 'Bridge Anime S1' },
                        format: 'TV',
                        episodes: 26,
                        startDate: { year: 2019 },
                        coverImage: { large: 'https://img/b1.jpg' },
                      },
                    },
                    {
                      relationType: 'SEQUEL',
                      node: {
                        id: 1003,
                        idMal: 10003,
                        title: { romaji: 'Bridge Anime S2', english: 'Bridge Anime S2' },
                        format: 'TV',
                        episodes: 12,
                        startDate: { year: 2021 },
                        coverImage: { large: 'https://img/b2.jpg' },
                      },
                    },
                  ],
                },
              },
            },
          }), { status: 200 });
        }
        if (id === 1003) {
          return new Response(JSON.stringify({
            data: {
              Media: {
                id: 1003,
                idMal: 10003,
                title: { romaji: 'Bridge Anime S2', english: 'Bridge Anime S2' },
                format: 'TV',
                episodes: 12,
                startDate: { year: 2021 },
                coverImage: { large: 'https://img/b2.jpg' },
                relations: {
                  edges: [
                    {
                      relationType: 'PREQUEL',
                      node: {
                        id: 1002,
                        idMal: 10002,
                        title: { romaji: 'Bridge Movie', english: 'Bridge Movie' },
                        format: 'MOVIE',
                        episodes: 1,
                        startDate: { year: 2020 },
                        coverImage: { large: 'https://img/bm.jpg' },
                      },
                    },
                  ],
                },
              },
            },
          }), { status: 200 });
        }
      }
      if (url.includes('api.jikan.moe/v4/anime/10001/themes')) {
        return new Response(JSON.stringify({
          data: { openings: ['1: "First OP" by Band A (eps 1-26)'], endings: [] },
        }), { status: 200 });
      }
      if (url.includes('api.jikan.moe/v4/anime/10003/themes')) {
        return new Response(JSON.stringify({
          data: { openings: ['1: "Second OP" by Band B (eps 1-12)'], endings: [] },
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const result = await getAnimeThemes(1001);

    expect(result.success).toBe(true);
    expect(result.seasons?.map((s) => s.anilistId)).toEqual([1001, 1003]);
    expect(result.seasons?.map((s) => s.seasonNumber)).toEqual([1, 2]);
    expect(result.themes?.map((th) => th.title)).toEqual(['First OP', 'Second OP']);
  });

  it('does not cache empty themes responses so transient failures can be retried', async () => {
    const animeGetThemes = vi
      .fn()
      .mockResolvedValueOnce({ success: true, themes: [] })
      .mockResolvedValueOnce({ success: true, themes: [sampleTheme] });
    setPyWebViewPlatform({ anime_search: vi.fn(), anime_get_themes: animeGetThemes });

    const first = await getAnimeThemes(777);
    expect(first).toEqual({ success: true, themes: [] });
    expect(__animeApiTesting.getCacheSizes().themes).toBe(0);

    const second = await getAnimeThemes(777);
    expect(second).toEqual({ success: true, themes: [sampleTheme] });
    expect(animeGetThemes).toHaveBeenCalledTimes(2);
    expect(__animeApiTesting.getCacheSizes().themes).toBe(1);
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
  it('hydrates official full track from Deezer (skipping covers) and returns 1-tap videoId when verified', async () => {
    searchDeezerMock.mockResolvedValueOnce([
      {
        id: 'dz-cover',
        deezerId: 111,
        title: 'Haruka Kanata (Acoustic Cover)',
        artist: 'Random Cover Band',
        album: 'Anime Covers',
        duration: 210,
        cover: 'https://img/cover.jpg',
      },
      {
        id: 'dz-999',
        deezerId: 999,
        title: 'Haruka Kanata',
        canonicalTitle: 'Haruka Kanata',
        artist: 'ASIAN KUNG-FU GENERATION',
        album: 'Kimi Tsunagi Five M',
        canonicalAlbum: 'Kimi Tsunagi Five M',
        duration: 244,
        cover: 'https://img/hd-studio.jpg',
        isrc: 'JPKS00300123',
      },
    ]);
    const verified = makeVerifiedCandidate({ videoId: 'yt-haruka-full' });
    getDownloadCandidatesMock.mockResolvedValueOnce([verified]);

    const result = await downloadAnimeTheme(sampleTheme, 'Naruto', sampleAnime.cover);

    expect(searchDeezerMock).toHaveBeenCalledWith('Haruka Kanata Asian Kung-Fu Generation', 0, 8);
    expect(getDownloadCandidatesMock).toHaveBeenCalledTimes(1);
    expect(getDownloadCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deezerId: 999,
        isrc: 'JPKS00300123',
        duration: 244,
        cover: 'https://img/hd-studio.jpg',
      }),
      true,
      { depth: 'light' },
    );
    expect(result).toEqual({
      success: true,
      track: expect.objectContaining({
        id: 'dz-999',
        deezerId: 999,
        title: 'Haruka Kanata',
      }),
      videoId: 'yt-haruka-full',
      candidates: [verified],
      sourceUrl: sampleTheme.audioUrl,
    });
  });

  it('escalates from light to deep candidate search when light yields no 1-tap candidate', async () => {
    searchDeezerMock.mockRejectedValueOnce(new Error('Deezer offline'));
    const verifiedDeep = makeVerifiedCandidate({ videoId: 'yt-deep-hit' });
    getDownloadCandidatesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([verifiedDeep]);

    const result = await downloadAnimeTheme(sampleTheme, 'Naruto', sampleAnime.cover);

    expect(getDownloadCandidatesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'anime-20-OP-2' }), true, { depth: 'light' });
    expect(getDownloadCandidatesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'anime-20-OP-2' }), true, { depth: 'deep' });
    expect(result.success).toBe(true);
    expect(result.videoId).toBe('yt-deep-hit');
  });

  it('uses the original song identity and asks the user to select full audio when candidates are ambiguous', async () => {
    const ambiguousCandidate = {
      videoId: 'full-song',
      title: 'Haruka Kanata',
      channel: 'Asian Kung-Fu Generation - Topic',
      duration: 244,
      score: 160,
      verification: 'review' as const,
      rejectionReasons: ['catalog_edition_ambiguous'],
    };
    getDownloadCandidatesMock.mockResolvedValue([ambiguousCandidate]);

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
    expect(result.videoId).toBeUndefined();
    expect(getDownloadCandidatesMock).toHaveBeenCalledWith(result.track, true, { depth: 'light' });
    expect(getDownloadCandidatesMock).toHaveBeenCalledWith(result.track, true, { depth: 'deep' });
  });
});
