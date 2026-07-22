import { describe, expect, it } from 'vitest';
import type { DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';
import { getCandidateMatchPresentation } from './candidateMatch';

const track: Track = {
  id: '1',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
  cover: '',
};

function candidate(overrides: Partial<DownloadCandidate>): DownloadCandidate {
  return {
    videoId: 'video',
    title: 'Artist - Song',
    channel: 'Artist',
    duration: 180,
    score: 150,
    confidence: 'alta',
    source: 'youtube_music',
    edition: 'unknown',
    verification: 'verified',
    evidence: {
      isrcMatch: false,
      titleMatch: true,
      artistMatch: true,
      albumMatch: true,
      durationDifference: 0,
      official: true,
      youtubeMusicSong: true,
      editionMatch: null,
      contradictions: [],
    },
    rejectionReasons: [],
    ...overrides,
  };
}

describe('candidate match presentation', () => {
  it('marks official audio with exact duration as an exact match', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Artist - Song (Official Audio)',
      channel: 'Artist - Topic',
    }));

    expect(result.tone).toBe('exact');
    expect(result.percent).toBeGreaterThanOrEqual(94);
    expect(result.badgeKeys).toEqual([
      'candidateOfficialAudio',
      'candidateExactDuration',
    ]);
  });

  it('allows a non-official exact-duration candidate to be a high match', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Artist - Song',
      channel: 'Uploader',
      score: 210,
    }));

    expect(result.tone).toBe('high');
    expect(result.percent).toBe(95);
    expect(result.badgeKeys).toContain('candidateExactDuration');
  });

  it('does not color an altered version as a recommended match', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Artist - Song (Sped Up Remix)',
      score: 210,
    }));

    expect(result.tone).toBe('alternate');
    expect(result.percent).toBeLessThan(80);
    expect(result.badgeKeys).toContain('candidateRemix');
  });

  it('warns when duration is far from the source track', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      duration: 245,
    }));

    expect(result.tone).toBe('alternate');
    expect(result.detailKey).toBe('candidateDetailWrongDuration');
  });

  it('keeps lyric videos in review even with a high score', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Artist - Song Lyrics',
      channel: 'Lyrics Channel',
      score: 190,
    }));

    expect(result.tone).toBe('review');
    expect(result.badgeKeys).toContain('candidateLyrics');
  });

  it('keeps official visualizers in review instead of marking them exact', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Artist - Song [Official Visualizer]',
      channel: 'Artist',
      score: 215,
    }));

    expect(result.tone).toBe('review');
    expect(result.statusKey).toBe('candidateReview');
    expect(result.detailKey).toBe('candidateDetailMusicVideo');
    expect(result.badgeKeys).toContain('candidateMusicVideo');
  });
});
