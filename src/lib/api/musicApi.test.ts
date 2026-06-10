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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pickerResult).toEqual(prefetched);
  });
});

describe('musicApi candidate ranking', () => {
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
