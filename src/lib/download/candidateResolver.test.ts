import { describe, expect, it } from 'vitest';
import type { Track } from '@/types/music';
import { canDownloadWithOneTap, resolveDownloadCandidates, type RawDownloadCandidate } from './candidateResolver';

const track: Track = {
  id: '1', title: 'Example Song', artist: 'The Artist', album: 'The Album',
  duration: 200, cover: '', isrc: 'US-AAA-24-00001', edition: 'explicit',
};

function candidate(overrides: Partial<RawDownloadCandidate> = {}): RawDownloadCandidate {
  return {
    videoId: 'video-1', title: 'Example Song', artist: 'The Artist',
    channel: 'The Artist - Topic', album: 'The Album', duration: 201,
    source: 'youtube_music', resultType: 'song', edition: 'explicit', ...overrides,
  };
}

describe('candidateResolver', () => {
  it('verifies an exact ISRC even if other evidence is incomplete', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({
      title: 'Example Song', channel: 'Uploader', artist: 'The Artist', duration: 0,
      source: 'youtube', isrc: 'USAAA2400001', edition: 'unknown',
    })]);
    expect(result.verification).toBe('verified');
    expect(result.evidence.isrcMatch).toBe(true);
    expect(canDownloadWithOneTap(result)).toBe(true);
  });

  it('verifies an official YouTube Music song within two percent', () => {
    const [result] = resolveDownloadCandidates(track, [candidate()]);
    expect(result.verification).toBe('verified');
    expect(result.evidence.youtubeMusicSong).toBe(true);
  });

  it('verifies structured YouTube Music catalog artist metadata without a Topic label', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({
      channel: '',
      artist: 'The Artist',
    })]);

    expect(result.evidence.titleMatch).toBe(true);
    expect(result.evidence.artistMatch).toBe(true);
    expect(result.evidence.official).toBe(true);
    expect(result.verification).toBe('verified');
  });

  it('trusts the first YouTube Music song without pretending its uploader is official metadata', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({
      channel: 'The Artist',
      artist: '',
    })]);

    expect(result.evidence.artistMatch).toBe(true);
    expect(result.evidence.official).toBe(false);
    expect(result.verification).toBe('verified');
  });

  it.each([
    ['cover', 'Example Song cover'],
    ['live', 'Example Song live'],
    ['nightcore', 'Example Song nightcore'],
    ['remix', 'Example Song remix'],
    ['instrumental', 'Example Song instrumental'],
  ])('rejects %s variants that were not requested', (_kind, title) => {
    const [result] = resolveDownloadCandidates(track, [candidate({ title })]);
    expect(result.verification).toBe('rejected');
    expect(canDownloadWithOneTap(result)).toBe(false);
  });

  it('rejects a known clean edition for an explicit catalog track', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({ edition: 'clean' })]);
    expect(result.verification).toBe('rejected');
    expect(result.rejectionReasons).toContain('edition_incompatible');
  });

  it('does not block a YouTube Music song when its edition metadata is absent', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({ edition: 'unknown' })]);
    expect(result.verification).toBe('verified');
  });

  it('uses duration only to protect the general YouTube fallback', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({
      source: 'youtube',
      duration: 245,
    })]);
    expect(result.verification).toBe('rejected');
    expect(result.rejectionReasons).toContain('duration_incompatible');
  });

  it('does not require duration metadata from a YouTube Music song', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({ duration: 0 })]);
    expect(result.verification).toBe('verified');
    expect(result.rejectionReasons).not.toContain('duration_incompatible');
  });

  it('does not reject a remix when the catalog explicitly requests it', () => {
    const remixTrack = { ...track, title: 'Example Song Remix', canonicalTitle: 'Example Song Remix' };
    const [result] = resolveDownloadCandidates(remixTrack, [candidate({ title: 'Example Song Remix' })]);
    expect(result.rejectionReasons).not.toContain('remix');
  });

  it('trusts the first exact YouTube Music song when flat Android metadata is incomplete', () => {
    const cleanTrack = { ...track, edition: 'clean' as const };
    const results = resolveDownloadCandidates(cleanTrack, [
      candidate({ artist: '', channel: '', duration: 0, edition: 'unknown' }),
      candidate({ videoId: 'speed', title: 'Example Song (Sped Up)', artist: '', channel: '', duration: 0 }),
    ]);
    expect(results[0].verification).toBe('verified');
    expect(canDownloadWithOneTap(results[0])).toBe(true);
    expect(results[1].verification).toBe('rejected');
  });

  it('matches a requested Radio Edit and rejects an Extended Version', () => {
    const radioTrack = {
      ...track,
      title: "Everybody (Backstreet's Back) (Radio Edit)",
      canonicalTitle: "Everybody (Backstreet's Back) (Radio Edit)",
      artist: 'Backstreet Boys',
      edition: 'clean' as const,
    };
    const results = resolveDownloadCandidates(radioTrack, [
      candidate({
        videoId: 'extended',
        title: "Everybody (Backstreet's Back) (Extended Version)",
        artist: '',
        channel: '',
        duration: 0,
        edition: 'unknown',
      }),
      candidate({
        videoId: 'radio',
        title: "Everybody (Backstreet's Back) (Radio Edit)",
        artist: '',
        channel: '',
        duration: 0,
        edition: 'unknown',
      }),
    ]);
    expect(results[0].videoId).toBe('radio');
    expect(results[0].verification).toBe('verified');
    expect(results.find((result) => result.videoId === 'extended')?.rejectionReasons)
      .toContain('extended');
  });

  it('requires review when only different featured versions are available', () => {
    const plainTrack = { ...track, title: 'Take Me to the Beach', canonicalTitle: 'Take Me to the Beach', edition: 'unknown' as const };
    const results = resolveDownloadCandidates(plainTrack, [
      candidate({ videoId: 'ado', title: 'Take Me to the Beach (feat. Ado)', artist: '', channel: '', duration: 0 }),
      candidate({ videoId: 'baker', title: 'Take Me to the Beach (feat. Baker Boy)', artist: '', channel: '', duration: 0 }),
    ]);
    expect(results.every((result) => !canDownloadWithOneTap(result))).toBe(true);
    expect(results.every((result) => result.rejectionReasons.includes('featured_artist_unspecified'))).toBe(true);
  });

  it('detects collaborations exposed only through structured YouTube Music artists', () => {
    const plainTrack = { ...track, title: 'Take Me to the Beach', canonicalTitle: 'Take Me to the Beach', artist: 'Imagine Dragons', edition: 'unknown' as const };
    const results = resolveDownloadCandidates(plainTrack, [
      candidate({ videoId: 'ado', title: 'Take Me to the Beach', artist: 'Imagine Dragons, Ado', channel: '', duration: 0 }),
      candidate({ videoId: 'baker', title: 'Take Me to the Beach', artist: 'Imagine Dragons, Baker Boy', channel: '', duration: 0 }),
    ]);
    expect(results.every((result) => !canDownloadWithOneTap(result))).toBe(true);
    expect(results.every((result) => result.rejectionReasons.includes('featured_artist_unspecified'))).toBe(true);
  });

  it('forces review when catalog edition is unknown and variants compete', () => {
    const unknownTrack = { ...track, edition: 'unknown' as const };
    const results = resolveDownloadCandidates(unknownTrack, [
      candidate({ videoId: 'explicit', edition: 'explicit' }),
      candidate({ videoId: 'clean', edition: 'clean' }),
    ]);
    expect(results.every((result) => result.verification !== 'verified')).toBe(true);
  });

  it('trusts the first localized YouTube Music song and separates real versions', () => {
    const localizedTrack: Track = {
      ...track,
      title: 'Where Our Blue Is',
      canonicalTitle: 'Where Our Blue Is',
      artist: 'Tatsuya Kitani',
      edition: 'unknown',
    };
    const results = resolveDownloadCandidates(localizedTrack, [
      candidate({
        videoId: 'main',
        title: '青のすみか - Where Our Blue Is',
        artist: '',
        channel: '',
        duration: 0,
        edition: 'unknown',
      }),
      candidate({
        videoId: 'first-take',
        title: '青のすみか - From THE FIRST TAKE - Where Our Blue Is',
        artist: '',
        channel: '',
        duration: 0,
        edition: 'unknown',
      }),
      candidate({
        videoId: 'acoustic',
        title: '青のすみか (Acoustic ver.) - Where Our Blue Is',
        artist: '',
        channel: '',
        duration: 0,
        edition: 'unknown',
      }),
    ]);

    expect(results[0].videoId).toBe('main');
    expect(results[0].verification).toBe('verified');
    expect(results.find((result) => result.videoId === 'first-take')?.rejectionReasons)
      .toContain('first_take');
    expect(results.find((result) => result.videoId === 'acoustic')?.rejectionReasons)
      .toContain('acoustic');
  });

  it('collapses duplicate YouTube Music songs with the same semantic version', () => {
    const results = resolveDownloadCandidates(track, [
      candidate({ videoId: 'main-1', edition: 'unknown' }),
      candidate({ videoId: 'main-2', edition: 'unknown' }),
      candidate({ videoId: 'acoustic', title: 'Example Song (Acoustic)', edition: 'unknown' }),
    ]);

    expect(results.map((result) => result.videoId)).toEqual(['main-1', 'acoustic']);
    expect(results[0].verification).toBe('verified');
  });

  it('trusts the first YouTube Music song even when only its localized title is exposed', () => {
    const [result] = resolveDownloadCandidates(track, [candidate({
      title: 'サンプル曲',
      artist: '',
      channel: '',
      duration: 0,
      edition: 'unknown',
    })]);

    expect(result.evidence.titleMatch).toBe(false);
    expect(result.verification).toBe('verified');
  });

  it('produces the same contract from recorded Desktop and Android metadata', () => {
    const recorded = candidate({ isrc: 'USAAA2400001', sourceCodec: 'opus', sourceAbr: 140 });
    const desktop = resolveDownloadCandidates(track, [{ ...recorded }]);
    const android = resolveDownloadCandidates(track, [{ ...recorded }]);
    expect(android).toEqual(desktop);
  });
});
