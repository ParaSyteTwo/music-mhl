import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __testing, getDownloadCandidates, searchDeezer } from './musicApi';
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

    expect(result?.synced).toContain('[00:10.00]無敵の笑顔');
    expect(result?.synced).toContain('[00:10.00]muteki no egao');
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
});

describe('musicApi request reuse', () => {
  it('deduplicates equal searches in flight and caches the result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tracks: [{
          id: '1',
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
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

  it('bounds search cache memory on long sessions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ tracks: [] }), { status: 200 })
    ));

    await Promise.all(
      Array.from({ length: 110 }, (_, index) => searchDeezer(`query-${index}`)),
    );

    expect(__testing.getCacheSizes().searches).toBeLessThanOrEqual(100);
  });

  it('reuses candidate prefetch when the picker asks for the same track', async () => {
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

    const [prefetched, pickerResult] = await Promise.all([
      getDownloadCandidates(track),
      getDownloadCandidates(track),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pickerResult).toEqual(prefetched);
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

  it('returns at most three unique candidates ordered by quality', () => {
    const ranked = __testing.rankDownloadCandidates(track, [
      { videoId: 'cover', title: 'Song cover', channel: 'Fan', duration: 180, score: 80 },
      { videoId: 'official', title: 'Artist - Song Official Audio', channel: 'Artist - Topic', duration: 180, score: 100 },
      { videoId: 'live', title: 'Artist - Song live concert', channel: 'Artist', duration: 230, score: 110 },
      { videoId: 'official', title: 'Artist - Song', channel: 'Artist', duration: 180, score: 90 },
      { videoId: 'remix', title: 'Artist - Song remix', channel: 'Uploader', duration: 205, score: 100 },
    ]);

    expect(ranked).toHaveLength(3);
    expect(new Set(ranked.map((candidate) => candidate.videoId)).size).toBe(3);
    expect(ranked[0].videoId).toBe('official');
    expect(ranked.map((candidate) => candidate.score)).toEqual(
      [...ranked].map((candidate) => candidate.score).sort((a, b) => b - a),
    );
  });

  it('expands only when primary results are insufficient', () => {
    expect(__testing.shouldExpandCandidateSearch([
      { videoId: '1', title: 'Song', channel: 'Artist', duration: 180, score: 150, confidence: 'alta' },
      { videoId: '2', title: 'Song', channel: 'Artist', duration: 181, score: 130, confidence: 'alta' },
    ])).toBe(false);

    expect(__testing.shouldExpandCandidateSearch([
      { videoId: '1', title: 'Song', channel: 'Artist', duration: 180, score: 100, confidence: 'media' },
    ])).toBe(true);
  });

});
