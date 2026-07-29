import { describe, expect, it } from 'vitest';
import type { DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';
import { getCandidateMatchPresentation } from './candidateMatch';

const track: Track = {
  id: '1', title: 'Song', artist: 'Artist', album: 'Album', duration: 180, cover: '',
};

function candidate(overrides: Partial<DownloadCandidate> = {}): DownloadCandidate {
  return {
    videoId: 'video',
    title: 'Song',
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
  it('presents a verified YouTube Music result as the primary version without a percentage', () => {
    const result = getCandidateMatchPresentation(track, candidate());
    expect(result).not.toHaveProperty('percent');
    expect(result.tone).toBe('primary');
    expect(result.statusKey).toBe('candidatePrimary');
    expect(result.badgeKeys).toContain('candidateExactDuration');
  });

  it('presents unresolved candidates as a version choice', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      verification: 'review',
      confidence: 'baja',
    }));
    expect(result.tone).toBe('review');
    expect(result.statusKey).toBe('candidateChooseVersion');
  });

  it('does not classify Radio Edit as a remix', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Song (Radio Edit)',
      verification: 'rejected',
      evidence: {
        ...candidate().evidence,
        contradictions: ['radio_edit'],
      },
      rejectionReasons: ['radio_edit'],
    }));
    expect(result.badgeKeys).toContain('candidateRadioEdit');
    expect(result.badgeKeys).not.toContain('candidateRemix');
  });

  it('explains a different featured version', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      verification: 'rejected',
      evidence: {
        ...candidate().evidence,
        contradictions: ['featured_artist_mismatch'],
      },
      rejectionReasons: ['featured_artist_mismatch'],
    }));
    expect(result.detailKey).toBe('candidateDetailVersionMismatch');
    expect(result.badgeKeys).toContain('candidateFeaturedVersion');
  });

  it('marks THE FIRST TAKE as a distinct version', () => {
    const result = getCandidateMatchPresentation(track, candidate({
      title: 'Song - From THE FIRST TAKE',
      verification: 'rejected',
      evidence: {
        ...candidate().evidence,
        contradictions: ['first_take'],
      },
      rejectionReasons: ['first_take'],
    }));
    expect(result.tone).toBe('alternate');
    expect(result.badgeKeys).toContain('candidateFirstTake');
  });
});
