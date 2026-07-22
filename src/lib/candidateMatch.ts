import type { DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';

export type CandidateMatchTone = 'exact' | 'high' | 'review' | 'alternate';

export interface CandidateMatchPresentation {
  tone: CandidateMatchTone;
  percent: number;
  statusKey: string;
  detailKey: string;
  badgeKeys: string[];
}

const ALTERED_PATTERNS = {
  cover: /\b(cover|fan cover|dub cover|spanish cover)\b/,
  live: /\b(live|concert|en vivo|festival)\b/,
  remix: /\b(remix|bootleg|mashup|edit)\b/,
  speed: /\b(sped up|slowed|nightcore|8d|reverb)\b/,
  instrumental: /\b(instrumental|karaoke|acapella|a cappella)\b/,
};

function durationDifference(track: Track, candidate: DownloadCandidate): number | null {
  if (track.duration <= 0 || candidate.duration <= 0) return null;
  return Math.abs(candidate.duration - track.duration) / track.duration;
}

function matchPercent(candidate: DownloadCandidate, tone: CandidateMatchTone): number {
  if (candidate.score >= 1000) return tone === 'alternate' ? 78 : 99;

  const base = Math.round(58 + Math.max(0, candidate.score - 70) * 0.34);
  const limits: Record<CandidateMatchTone, [number, number]> = {
    exact: [94, 99],
    high: [86, 95],
    review: [70, 87],
    alternate: [55, 79],
  };
  return Math.min(limits[tone][1], Math.max(limits[tone][0], base));
}

export function getCandidateMatchPresentation(
  track: Track,
  candidate: DownloadCandidate,
): CandidateMatchPresentation {
  const title = candidate.title.toLowerCase();
  const channel = candidate.channel.toLowerCase();
  const haystack = `${title} ${channel}`;
  const durationDiff = durationDifference(track, candidate);

  const officialAudio = /\b(official audio|audio only|provided to youtube)\b/.test(haystack);
  const officialChannel = /\b(topic|vevo|official)\b/.test(channel);
  const musicVideo = /\b(official music video|music video|visualizer|\bm\/v\b|\bmv\b)\b/.test(title);
  const lyrics = /\b(lyrics?|lyric video|sub esp|sub english|subbed)\b/.test(title);
  const cover = ALTERED_PATTERNS.cover.test(haystack);
  const live = ALTERED_PATTERNS.live.test(haystack);
  const remix = ALTERED_PATTERNS.remix.test(haystack) && !title.includes('official remix');
  const alteredSpeed = ALTERED_PATTERNS.speed.test(haystack);
  const instrumental = ALTERED_PATTERNS.instrumental.test(haystack);
  const altered = cover || live || remix || alteredSpeed || instrumental;
  const exactDuration = durationDiff !== null && durationDiff <= 0.02;
  const closeDuration = durationDiff !== null && durationDiff <= 0.05;
  const wrongDuration = durationDiff !== null && durationDiff > 0.12;

  let tone: CandidateMatchTone;
  if (altered || wrongDuration) {
    tone = 'alternate';
  } else if ((officialAudio || officialChannel) && exactDuration && !musicVideo && !lyrics) {
    tone = 'exact';
  } else if (
    candidate.confidence === 'alta'
    && (officialAudio || officialChannel || closeDuration)
    && !musicVideo
    && !lyrics
  ) {
    tone = 'high';
  } else {
    tone = 'review';
  }

  if (candidate.verification === 'rejected') tone = 'alternate';
  else if (candidate.verification === 'review' || candidate.verification === 'probable') tone = 'review';
  else if (candidate.verification === 'verified') {
    tone = candidate.evidence.isrcMatch ? 'exact' : 'high';
  }

  const badgeKeys: string[] = [];
  if (cover) badgeKeys.push('candidateCover');
  else if (live) badgeKeys.push('candidateLive');
  else if (remix) badgeKeys.push('candidateRemix');
  else if (alteredSpeed) badgeKeys.push('candidateAlteredSpeed');
  else if (instrumental) badgeKeys.push('candidateInstrumental');
  else {
    if (officialAudio) badgeKeys.push('candidateOfficialAudio');
    else if (officialChannel) badgeKeys.push('candidateOfficialChannel');

    if (musicVideo) badgeKeys.push('candidateMusicVideo');
    else if (lyrics) badgeKeys.push('candidateLyrics');

    if (exactDuration) badgeKeys.push('candidateExactDuration');
    else if (closeDuration) badgeKeys.push('candidateCloseDuration');
  }

  let detailKey = 'candidateDetailReview';
  if (tone === 'exact') detailKey = 'candidateDetailExact';
  else if (tone === 'high') detailKey = 'candidateDetailHigh';
  else if (wrongDuration) detailKey = 'candidateDetailWrongDuration';
  else if (altered) detailKey = 'candidateDetailAlternate';
  else if (musicVideo) detailKey = 'candidateDetailMusicVideo';
  else if (lyrics) detailKey = 'candidateDetailLyrics';

  return {
    tone,
    percent: matchPercent(candidate, tone),
    statusKey: {
      exact: 'candidateExactMatch',
      high: 'candidateHighMatch',
      review: 'candidateReview',
      alternate: 'candidateAlternate',
    }[tone],
    detailKey,
    badgeKeys: badgeKeys.slice(0, 2),
  };
}
