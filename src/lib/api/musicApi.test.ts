import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __testing, downloadTrackAudio, getDeezerTrackMeta, getDownloadCandidates, searchDeezer } from './musicApi';
import type { Track } from '@/types/music';

const track: Track = {
  id: 'track-1',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
  cover: '',
};

beforeEach(() => {
  __testing.clearRequestCaches();
  if (typeof localStorage !== 'undefined') localStorage.clear();
  vi.restoreAllMocks();
});

describe('musicApi lyrics combination', () => {
  it('does not insert letras.com Spanish translation when target language is English and source is English', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['I want your love in my heart'],
        romaji: [],
        translated: ['Quiero tu amor en mi corazon'],
        sourceUrl: 'https://www.letras.com/example/song/',
      },
      { syncedLrc: '[00:01.00]I want your love in my heart', plainLrc: 'I want your love in my heart' },
      {
        lyricOriginal: true,
        lyricRomanization: false,
        lyricTranslation: true,
        deviceLang: 'en',
      },
    );

    expect(result?.synced).toBe('[00:01.00]I want your love in my heart');
    expect(result?.synced).not.toContain('Quiero tu amor');
  });

  it('does not append a Spanish translation to Spanish original lyrics', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['Baila conmigo toda la noche', 'Sigo mirando tus ojos'],
        romaji: [],
        translated: ['Baila conmigo durante toda la noche', 'Continúo mirando tus ojos'],
        sourceUrl: 'https://www.letras.com/example/song/',
      },
      null,
      {
        lyricOriginal: true,
        lyricRomanization: false,
        lyricTranslation: true,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toBeNull();
    expect(result?.plain).not.toContain('durante toda');
    expect(result?.plain).not.toContain('Continúo');
  });

  it('deduplicates an equal translated layer without removing repeated song lines', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['I love you', 'I love you'],
        romaji: [],
        translated: ['I love you!', 'Te amo'],
        sourceUrl: 'https://www.letras.com/example/song/',
      },
      null,
      {
        lyricOriginal: true,
        lyricRomanization: false,
        lyricTranslation: true,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toBeNull();
    expect(result?.plain?.match(/I love you/g)).toHaveLength(2);
    expect(result?.plain).toContain('Te amo');
  });

  it('aligns letras.com lines to matching LRCLIB timestamps instead of raw index order', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['無敵の笑顔', '知りたい秘密'],
        romaji: ['muteki no egao', 'shiritai himitsu'],
        translated: [],
        sourceUrl: 'https://www.letras.com/yoasobi/idol/',
      },
      {
        syncedLrc: [
          '[00:03.00]Intro line',
          '[00:10.00]無敵の笑顔',
          '[00:17.00]知りたい秘密',
        ].join('\n'),
        plainLrc: '',
      },
      {
        lyricOriginal: true,
        lyricRomanization: true,
        lyricTranslation: false,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toContain('[00:10.00]無敵の笑顔  •  muteki no egao');
    expect(result?.synced).toContain('[00:17.00]知りたい秘密');
    expect(result?.synced).not.toContain('[00:03.00]無敵の笑顔');
  });

  it('uses letras.com romaji as the primary lyrics when latin-only mode is enabled', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['無敵の笑顔', '知りたい秘密'],
        romaji: ['muteki no egao', 'shiritai himitsu'],
        translated: [],
        sourceUrl: 'https://www.letras.com/yoasobi/idol/',
      },
      null,
      {
        lyricOriginal: true,
        lyricRomanization: true,
        lyricTranslation: false,
        lyricLatinOnly: true,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toBeNull();
    expect(result?.plain).toContain('muteki no egao');
    expect(result?.plain).toContain('shiritai himitsu');
    expect(result?.plain).not.toContain('無敵の笑顔');
    expect(result?.plain).not.toContain('知りたい秘密');
  });

  it('falls back to the canonical LRCLIB timeline when letras.com cannot align completely', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['一致する行', '別バージョンの行'],
        romaji: ['', ''],
        translated: [],
        sourceUrl: 'https://www.letras.com/example/song/',
      },
      {
        syncedLrc: '[00:11.00]一致する行\n[00:19.00]正しい二行目',
        plainLrc: '一致する行\n正しい二行目',
      },
      {
        lyricOriginal: true,
        lyricRomanization: false,
        lyricTranslation: false,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toBe('[00:11.00]一致する行\n[00:19.00]正しい二行目');
    expect(result?.synced).not.toContain('[00:03.00]');
    expect(result?.synced).not.toContain('別バージョンの行');
  });

  it('never invents timestamps when only unsynchronized letras.com lyrics exist', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['無敵の笑顔'],
        romaji: ['muteki no egao'],
        translated: ['Sonrisa invencible'],
        sourceUrl: 'https://www.letras.com/yoasobi/idol/',
      },
      null,
      {
        lyricOriginal: false,
        lyricRomanization: true,
        lyricTranslation: true,
        deviceLang: 'es',
      },
    );

    expect(result?.synced).toBeNull();
    expect(result?.plain).toBe('muteki no egao\nSonrisa invencible');
  });

  describe('LRCLIB robust fetching and metadata cleaning', () => {
    it('cleans noise from titles and artist strings', () => {
      expect(__testing.cleanTitleForLyrics('Blinding Lights (feat. Rosalía)')).toBe('Blinding Lights');
      expect(__testing.cleanTitleForLyrics('Starboy [Official Music Video]')).toBe('Starboy');
      expect(__testing.cleanTitleForLyrics('Stayin Alive - Remastered 2020')).toBe('Stayin Alive');
      expect(__testing.cleanArtistForLyrics('AC/DC')).toBe('AC/DC');
      expect(__testing.cleanArtistForLyrics('Simon & Garfunkel')).toBe('Simon & Garfunkel');
      expect(__testing.cleanArtistForLyrics('Coldplay feat. BTS')).toBe('Coldplay');
      expect(__testing.cleanArtistForLyrics('David Guetta ft. Sia')).toBe('David Guetta');
    });

    it('sends required client identification headers to lrclib.net', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ syncedLyrics: '[00:01.00] Hi', plainLyrics: 'Hi' }), { status: 200 }),
      );

      await __testing.fetchLrclib('Song', 'Artist', 180);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://lrclib.net/api/get?'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Lrclib-Client': expect.stringContaining('MHLMusic'),
          }),
        }),
      );
    });

    it('falls back to search when /api/get returns 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/get')) {
          return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        }
        if (url.includes('/api/search')) {
          return new Response(JSON.stringify([
            {
              id: 123,
              trackName: 'Clean Title',
              artistName: 'Clean Artist',
              duration: 182,
              syncedLyrics: '[00:05.00] Realtime synced line',
              plainLyrics: 'Realtime synced line',
            },
          ]), { status: 200 });
        }
        return new Response('', { status: 500 });
      });

      const res = await __testing.fetchLrclib('Clean Title (feat. Extra)', 'Clean Artist', 180);

      expect(res.syncedLrc).toBe('[00:05.00] Realtime synced line');
      expect(res.plainLrc).toBe('Realtime synced line');
    });

    it('uses pywebview.api.lrclib_fetch when running in desktop pywebview', async () => {
      const lrclibFetchMock = vi.fn().mockResolvedValue({
        success: true,
        data: {
          syncedLyrics: '[00:10.00] Desktop lyric',
          plainLyrics: 'Desktop lyric',
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).pywebview = {
        api: {
          lrclib_fetch: lrclibFetchMock,
        },
      };

      try {
        const res = await __testing.fetchLrclib('Desktop Song', 'Desktop Artist');
        expect(lrclibFetchMock).toHaveBeenCalledWith(expect.stringContaining('https://lrclib.net/api/get?'));
        expect(res.syncedLrc).toBe('[00:10.00] Desktop lyric');
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).pywebview;
      }
    });

    it('getLyrics returns null early when all lyric preferences are disabled', async () => {
      const { getLyrics } = await import('./musicApi');
      const res = await getLyrics('Song', 'Artist', 180, {
        lyricOriginal: false,
        lyricRomanization: false,
        lyricTranslation: false,
        lyricLatinOnly: false,
        deviceLang: 'es',
      });
      expect(res).toEqual({ synced: null, plain: null });
    });
  });
});

describe('musicApi request reuse', () => {
  it('deduplicates equal searches in flight and caches the result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: [{
          id: '1',
          title: 'Song',
          artist: { name: 'Artist' },
          album: { title: 'Album' },
          duration: 180,
        }],
      }), { status: 200 }),
    );

    const [first, second] = await Promise.all([
      searchDeezer('  Song  '),
      searchDeezer('song'),
    ]);
    const cached = await searchDeezer('SONG');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(cached).toEqual(first);
  });

  it('preserves numeric albumId from Deezer search results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          {
            id: 4201,
            title: 'Track With Album ID',
            artist: { name: 'Artist A' },
            album: { id: 987654, title: 'Official Album', cover_big: 'https://cdn.example/big.jpg' },
            duration: 205,
          },
          {
            id: 4202,
            title: 'Track Without Album ID',
            artist: { name: 'Artist B' },
            album: { title: 'Single' },
            duration: 190,
          },
        ],
      }), { status: 200 }),
    );

    const results = await searchDeezer('album id check');

    expect(results).toHaveLength(2);
    expect(results[0].albumId).toBe(987654);
    expect(results[1].albumId).toBeUndefined();
  });

  it('bounds search cache memory on long sessions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    ));

    await Promise.all(
      Array.from({ length: 110 }, (_, index) => searchDeezer(`query-${index}`)),
    );

    expect(__testing.getCacheSizes().searches).toBeLessThanOrEqual(100);
  });

  it('deduplicates concurrent candidate requests for the same track', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        candidates: [{
          videoId: 'video-1',
          title: 'Song',
          channel: 'Artist',
          duration: 180,
          score: 150,
        }],
      }), { status: 200 }),
    );

    const [first, second] = await Promise.all([
      getDownloadCandidates(track),
      getDownloadCandidates(track),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it('caches and deduplicates Deezer /album/{id} calls across tracks of the same album', async () => {
    const albumCalls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/track/101')) {
        return new Response(JSON.stringify({
          id: 101,
          release_date: '2024-05-10',
          track_position: 1,
          disk_number: 1,
          artist: { name: 'Artist' },
          album: { id: 999, title: 'Shared Album' },
        }), { status: 200 });
      }
      if (url.includes('/track/102')) {
        return new Response(JSON.stringify({
          id: 102,
          release_date: '2024-05-10',
          track_position: 2,
          disk_number: 1,
          artist: { name: 'Artist' },
          album: { id: 999, title: 'Shared Album' },
        }), { status: 200 });
      }
      if (url.includes('/track/103')) {
        return new Response(JSON.stringify({
          id: 103,
          release_date: '2024-05-10',
          track_position: 3,
          disk_number: 1,
          artist: { name: 'Artist' },
          album: { id: 999, title: 'Shared Album' },
        }), { status: 200 });
      }
      if (url.includes('/album/999')) {
        albumCalls.push(url);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(JSON.stringify({
          id: 999,
          title: 'Shared Album',
          nb_tracks: 12,
          artist: { name: 'Album Artist' },
          genres: { data: [{ name: 'J-Pop' }] },
        }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    // 2 concurrent tracks from the same album (deduplicates in-flight) + 1 sequential (hits memory cache)
    const [meta1, meta2] = await Promise.all([
      getDeezerTrackMeta('dz-101'),
      getDeezerTrackMeta('dz-102'),
    ]);
    const meta3 = await getDeezerTrackMeta('dz-103');

    expect(albumCalls).toHaveLength(1);
    expect(meta1).toMatchObject({ genre: 'J-Pop', trackNumber: 1, trackTotal: 12, year: 2024 });
    expect(meta2).toMatchObject({ genre: 'J-Pop', trackNumber: 2, trackTotal: 12, year: 2024 });
    expect(meta3).toMatchObject({ genre: 'J-Pop', trackNumber: 3, trackTotal: 12, year: 2024 });
    expect(__testing.getCacheSizes().albums).toBe(1);
  });

  it('runs LRCLIB clean /api/get and structured /api/search in parallel while prioritizing clean /api/get', async () => {
    const startedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      startedUrls.push(url);
      if (url.includes('/api/get?') && url.includes('duration=')) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
      if (url.includes('/api/get?')) {
        // Slower than /api/search, yet must still win priority
        await new Promise((resolve) => setTimeout(resolve, 15));
        return new Response(JSON.stringify({
          syncedLyrics: '[00:04.25] Clean get lyric',
          plainLyrics: 'Clean get lyric',
        }), { status: 200 });
      }
      if (url.includes('/api/search?')) {
        return new Response(JSON.stringify([
          {
            id: 77,
            trackName: 'Parallel Track',
            artistName: 'Parallel Artist',
            duration: 180,
            syncedLyrics: '[00:05.50] Search fallback lyric',
            plainLyrics: 'Search fallback lyric',
          },
        ]), { status: 200 });
      }
      return new Response('', { status: 500 });
    });

    const res = await __testing.fetchLrclib('Parallel Track (Remastered)', 'Parallel Artist', 180);

    expect(res.syncedLrc).toBe('[00:04.25] Clean get lyric');
    expect(startedUrls.some((u) => u.includes('/api/get?') && !u.includes('duration='))).toBe(true);
    expect(startedUrls.some((u) => u.includes('/api/search?'))).toBe(true);
  });
});

describe('musicApi candidate ranking', () => {
  const animeTrack: Track = {
    ...track,
    title: 'Naruto Opening',
    album: 'Naruto OST',
  };

  it('does not add anime queries unless the user enabled anime search', () => {
    expect(__testing.buildCandidateQueries(animeTrack, false)).toEqual([
      'naruto opening artist official audio',
      'naruto opening artist',
    ]);
    expect(__testing.buildCandidateQueries(animeTrack, true)).toContain('naruto opening Opening 1');
  });

  it('uses an artist-first official-audio query for Android candidate search', () => {
    expect(__testing.buildAndroidCandidateQueries(track, false).slice(0, 4)).toEqual([
      'artist - song official audio',
      'artist song official audio',
      'song artist official audio',
      'song artist',
    ]);
    expect(__testing.buildAndroidCandidateQueries(animeTrack, false)).not.toContain('naruto opening Opening 1');
    expect(__testing.buildAndroidCandidateQueries(animeTrack, true)).toContain('naruto opening Opening 1');
  });

  it('keeps featured artists and requested versions in YouTube Music queries', () => {
    const versionedTrack = {
      ...track,
      title: 'Take Me to the Beach (feat. Ado) (Radio Edit)',
      canonicalTitle: 'Take Me to the Beach (feat. Ado) (Radio Edit)',
    };
    expect(__testing.buildAndroidCandidateQueries(versionedTrack, false)[0]).toBe(
      'artist - take me to the beach feat ado radio edit official audio',
    );
  });

  it('uses at most three candidates in light mode', () => {
    expect(__testing.getAndroidPrimaryCandidateLimit({ depth: 'deep' })).toBe(8);
    expect(__testing.getAndroidPrimaryCandidateLimit({ depth: 'light' })).toBe(3);
  });

  it('keeps light and deep candidate caches separate', () => {
    const light = __testing.buildCandidateCacheKey(track, false, false, { depth: 'light' });
    const deep = __testing.buildCandidateCacheKey(track, false, false, { depth: 'deep' });
    expect(light).not.toBe(deep);
  });

  it('keeps anime candidate caches separate from normal search caches', () => {
    const normal = __testing.buildCandidateCacheKey(animeTrack, false, false);
    const anime = __testing.buildCandidateCacheKey(animeTrack, true, false);
    expect(normal).not.toBe(anime);
  });

  it('handles non-object JSON values ("null", "123", arrays) in localStorage persistent candidate cache without throwing', () => {
    for (const badPayload of ['null', '123', '[1,2,3]', '"string"', '{corrupt']) {
      __testing.clearRequestCaches();
      localStorage.setItem(__testing.PERSISTENT_CANDIDATE_CACHE_KEY, badPayload);
      expect(() => __testing.readPersistentCandidateCache()).not.toThrow();
      expect(__testing.readPersistentCandidateCache()).toEqual({});
      expect(() => __testing.setPersistentCandidateCacheValue('k1', [])).not.toThrow();
    }
  });

  it('purges expired entries in persistent candidate cache and does not resurrect cleared data on debounced flush', () => {
    vi.useFakeTimers();
    try {
      __testing.clearRequestCaches();
      const now = Date.now();
      localStorage.setItem(
        __testing.PERSISTENT_CANDIDATE_CACHE_KEY,
        JSON.stringify({
          expiredKey: { value: [], expiresAt: now - 10_000 },
          validKey: { value: [], expiresAt: now + 60_000 },
        }),
      );

      __testing.setPersistentCandidateCacheValue('freshKey', []);
      vi.advanceTimersByTime(350);

      const persisted = JSON.parse(localStorage.getItem(__testing.PERSISTENT_CANDIDATE_CACHE_KEY) || '{}');
      expect(persisted).not.toHaveProperty('expiredKey');
      expect(persisted).toHaveProperty('validKey');
      expect(persisted).toHaveProperty('freshKey');

      // Schedule a new debounced write, then clear localStorage before flush fires
      __testing.setPersistentCandidateCacheValue('anotherKey', []);
      localStorage.clear();
      vi.advanceTimersByTime(350);

      // Must NOT have resurrected deleted cache back into localStorage
      expect(localStorage.getItem(__testing.PERSISTENT_CANDIDATE_CACHE_KEY)).toBeNull();
      expect(__testing.readPersistentCandidateCache()).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects LRCLIB clean /api/get candidate with mismatched duration so validated /api/search wins', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/get?') && url.includes('duration=')) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
      if (url.includes('/api/get?')) {
        return new Response(JSON.stringify({
          id: 500,
          trackName: 'Duration Track',
          artistName: 'Artist',
          duration: 320, // Wrong duration (>6s delta vs 180s)
          syncedLyrics: '[00:05.12] Extended remix lyric',
          plainLyrics: 'Extended remix lyric',
        }), { status: 200 });
      }
      if (url.includes('/api/search?')) {
        return new Response(JSON.stringify([
          {
            id: 501,
            trackName: 'Duration Track',
            artistName: 'Artist',
            duration: 181,
            syncedLyrics: '[00:04.88] Exact duration lyric',
            plainLyrics: 'Exact duration lyric',
          },
        ]), { status: 200 });
      }
      return new Response('', { status: 500 });
    });

    const res = await __testing.fetchLrclib('Duration Track (Remastered)', 'Artist', 180);
    expect(res.syncedLrc).toBe('[00:04.88] Exact duration lyric');
  });

  it('resolves candidates in downloadTrackAudio with valid signature and skips rejected candidates', async () => {
    const getCandidatesSpy = vi.fn().mockResolvedValue({
      success: true,
      candidates: [
        {
          videoId: 'rejected-cover',
          title: 'Song (Cover)',
          channel: 'Random Fan',
          duration: 180,
          source: 'youtube',
        },
        {
          videoId: 'verified-ytm',
          title: 'Song',
          channel: 'Artist - Topic',
          artist: 'Artist',
          duration: 180,
          source: 'youtube_music',
          resultType: 'song',
        },
      ],
    });
    const getRawAudioSpy = vi.fn().mockResolvedValue({
      success: true,
      data_b64: 'QUFB',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).pywebview = {
      api: {
        get_candidates: getCandidatesSpy,
        get_raw_audio: getRawAudioSpy,
      },
    };

    try {
      const buf = await downloadTrackAudio(track);
      expect(buf.byteLength).toBe(3);
      expect(getCandidatesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          animeSearchEnabled: false,
          depth: 'light',
        }),
      );
      expect(getRawAudioSpy).toHaveBeenCalledWith(
        'verified-ytm',
        'Song',
        'Artist',
        [],
        null,
        180,
        'm4a',
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).pywebview;
    }
  });

});
