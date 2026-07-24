import type { DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';

export type CandidateMatchTone = 'primary' | 'review' | 'alternate';

export interface CandidateMatchPresentation {
  tone: CandidateMatchTone;
  statusKey: string;
  detailKey: string;
  badgeKeys: string[];
}

const REASON_BADGES: Record<string, string> = {
  cover: 'candidateCover',
  live: 'candidateLive',
  remix: 'candidateRemix',
  nightcore: 'candidateAlteredSpeed',
  instrumental: 'candidateInstrumental',
  radio_edit: 'candidateRadioEdit',
  extended: 'candidateExtended',
  acoustic: 'candidateAcoustic',
  remaster: 'candidateRemaster',
  featured_artist_mismatch: 'candidateFeaturedVersion',
  featured_artist_missing: 'candidateFeaturedVersion',
  featured_artist_unspecified: 'candidateFeaturedVersion',
};

function durationBadge(track: Track, candidate: DownloadCandidate): string | null {
  if (track.duration <= 0 || candidate.duration <= 0) return null;
  const difference = Math.abs(candidate.duration - track.duration) / track.duration;
  if (difference <= 0.02) return 'candidateExactDuration';
  if (difference <= 0.05) return 'candidateCloseDuration';
  return null;
}

export function getCandidateMatchPresentation(
  track: Track,
  candidate: DownloadCandidate,
): CandidateMatchPresentation {
  const tone: CandidateMatchTone = candidate.verification === 'verified'
    ? 'primary'
    : candidate.verification === 'rejected'
      ? 'alternate'
      : 'review';
  const badgeKeys = candidate.evidence.contradictions
    .map((reason) => REASON_BADGES[reason.replace(/^missing_/, '')])
    .filter((key): key is string => Boolean(key));
  const duration = durationBadge(track, candidate);
  if (duration) badgeKeys.push(duration);

  let detailKey = 'candidateDetailReview';
  if (tone === 'primary') detailKey = 'candidateDetailPrimary';
  else if (candidate.rejectionReasons.includes('duration_incompatible')) {
    detailKey = 'candidateDetailWrongDuration';
  } else if (!candidate.evidence.titleMatch) {
    detailKey = 'candidateDetailTitleMismatch';
  } else if (
    candidate.rejectionReasons.some((reason) =>
      reason.startsWith('featured_artist') || reason.startsWith('missing_'))
  ) {
    detailKey = 'candidateDetailVersionMismatch';
  } else if (tone === 'alternate') {
    detailKey = 'candidateDetailAlternate';
  }

  return {
    tone,
    statusKey: {
      primary: 'candidatePrimary',
      review: 'candidateChooseVersion',
      alternate: 'candidateOtherVersion',
    }[tone],
    detailKey,
    badgeKeys: [...new Set(badgeKeys)].slice(0, 2),
  };
}
