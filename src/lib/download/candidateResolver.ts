import type { Track, TrackEdition } from '@/types/music';

export const CANDIDATE_RESOLVER_VERSION = 3;

export type CandidateSource = 'youtube_music' | 'youtube';
export type CandidateVerification = 'verified' | 'probable' | 'review' | 'rejected';
export type EditionPreference = 'catalog' | 'explicit' | 'clean' | 'ask';

export interface CandidateEvidence {
  isrcMatch: boolean;
  titleMatch: boolean;
  artistMatch: boolean;
  albumMatch: boolean;
  durationDifference: number | null;
  official: boolean;
  youtubeMusicSong: boolean;
  editionMatch: boolean | null;
  contradictions: string[];
}

export interface RawDownloadCandidate {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  source?: CandidateSource;
  resultType?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  edition?: TrackEdition;
  sourceCodec?: string;
  sourceAbr?: number;
}

export interface DownloadCandidate extends RawDownloadCandidate {
  source: CandidateSource;
  edition: TrackEdition;
  verification: CandidateVerification;
  evidence: CandidateEvidence;
  rejectionReasons: string[];
  score: number;
  label?: string;
  confidence: 'alta' | 'media' | 'baja';
}

export interface ResolveCandidateOptions {
  editionPreference?: EditionPreference;
}

const ALTERED_PATTERNS: Array<[string, RegExp]> = [
  ['cover', /\b(cover|fan cover|dub cover|spanish cover)\b/i],
  ['live', /\b(live|concert|en vivo|festival)\b/i],
  ['nightcore', /\b(nightcore|sped up|slowed|8d|reverb)\b/i],
  ['instrumental', /\b(instrumental|karaoke|acapella|a cappella)\b/i],
  ['remix', /\b(remix|bootleg|mashup)\b/i],
  ['music_video', /\b(official music video|music video|m\/v|visualizer)\b/i],
];

export function normalizeCandidateText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\.?\s+[^-–—,]+/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const wanted = needle.split(' ').filter(Boolean);
  return wanted.length > 0 && wanted.every((word) => haystack.split(' ').includes(word));
}

function inferEdition(candidate: RawDownloadCandidate): TrackEdition {
  if (candidate.edition && candidate.edition !== 'unknown') return candidate.edition;
  const text = `${candidate.title} ${candidate.album ?? ''}`.toLocaleLowerCase();
  if (/\b(clean|censored|radio edit|radio version)\b/.test(text)) return 'clean';
  if (/\b(explicit|uncensored|dirty version)\b/.test(text)) return 'explicit';
  return 'unknown';
}

function targetEdition(track: Track, preference: EditionPreference): TrackEdition {
  if (preference === 'explicit' || preference === 'clean') return preference;
  return preference === 'catalog' ? (track.edition ?? 'unknown') : 'unknown';
}

function editionCompatibility(
  track: Track,
  candidateEdition: TrackEdition,
  preference: EditionPreference,
): boolean | null {
  if (preference === 'ask') return null;
  const expected = targetEdition(track, preference);
  if (expected === 'unknown' || candidateEdition === 'unknown') return null;
  return expected === candidateEdition;
}

function classifyLabel(evidence: CandidateEvidence): string {
  if (evidence.contradictions.length) return evidence.contradictions[0];
  if (evidence.isrcMatch) return 'ISRC exacto';
  if (evidence.youtubeMusicSong && evidence.official) return 'YouTube Music oficial';
  return 'Revisar coincidencia';
}

export function resolveDownloadCandidates(
  track: Track,
  rawCandidates: RawDownloadCandidate[],
  options: ResolveCandidateOptions = {},
): DownloadCandidate[] {
  const preference = options.editionPreference ?? 'catalog';
  const wantedTitle = normalizeCandidateText(track.canonicalTitle?.trim() || track.title);
  const wantedArtist = normalizeCandidateText(track.artist);
  const wantedAlbum = normalizeCandidateText(track.canonicalAlbum?.trim() || track.album);
  const unique = new Map<string, DownloadCandidate>();

  for (const raw of rawCandidates) {
    if (!raw.videoId) continue;
    const title = normalizeCandidateText(raw.title);
    const channel = normalizeCandidateText(raw.channel);
    const candidateArtist = normalizeCandidateText(raw.artist ?? '');
    const candidateAlbum = normalizeCandidateText(raw.album ?? '');
    const combined = `${title} ${channel} ${candidateArtist}`.trim();
    const source = raw.source ?? 'youtube';
    const edition = inferEdition(raw);
    const durationDifference = track.duration > 0 && raw.duration > 0
      ? Math.abs(raw.duration - track.duration) / track.duration
      : null;
    const requestedEditionText = `${track.title} ${track.canonicalTitle ?? ''} ${track.album}`;
    const contradictions = ALTERED_PATTERNS
      .filter(([reason, pattern]) => {
        if (!pattern.test(`${raw.title} ${raw.channel}`) || pattern.test(requestedEditionText)) return false;
        return reason !== 'music_video' || durationDifference === null || durationDifference > 0.02;
      })
      .map(([reason]) => reason);
    const titleMatch = title === wantedTitle || containsWords(title, wantedTitle);
    const artistMatch = containsWords(combined, wantedArtist);
    const albumMatch = Boolean(wantedAlbum) && (
      candidateAlbum === wantedAlbum || containsWords(`${title} ${candidateAlbum}`, wantedAlbum)
    );
    const youtubeMusicSong = source === 'youtube_music' && (!raw.resultType || /song|track/i.test(raw.resultType));
    const catalogArtistMatch = Boolean(candidateArtist) && containsWords(candidateArtist, wantedArtist);
    const official = (
      /\b(topic|vevo|official|provided to youtube)\b/i.test(`${raw.channel} ${raw.title}`)
      || (youtubeMusicSong && catalogArtistMatch)
    );
    const normalizeIsrc = (value: string) => value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const isrcMatch = Boolean(
      track.isrc && raw.isrc && normalizeIsrc(track.isrc) === normalizeIsrc(raw.isrc),
    );
    const editionMatch = editionCompatibility(track, edition, preference);
    if (editionMatch === false) contradictions.push('edition_incompatible');
    if (durationDifference !== null && durationDifference > 0.12) contradictions.push('duration_incompatible');

    const evidence: CandidateEvidence = {
      isrcMatch,
      titleMatch,
      artistMatch,
      albumMatch,
      durationDifference,
      official,
      youtubeMusicSong,
      editionMatch,
      contradictions: [...new Set(contradictions)],
    };

    let score = 0;
    if (titleMatch) score += 35;
    if (artistMatch) score += 25;
    if (albumMatch) score += 8;
    if (youtubeMusicSong) score += 18;
    if (official) score += 12;
    if (durationDifference !== null) {
      if (durationDifference <= 0.02) score += 30;
      else if (durationDifference <= 0.05) score += 16;
      else if (durationDifference > 0.12) score -= 35;
    }
    if (editionMatch === true) score += 10;
    if (isrcMatch) score += 1000;
    score -= evidence.contradictions.length * 60;

    const unknownEditionBlocksVerification = (
      preference !== 'ask'
      && targetEdition(track, preference) !== 'unknown'
      && edition === 'unknown'
      && !isrcMatch
    );
    let verification: CandidateVerification;
    if (evidence.contradictions.length > 0 || !titleMatch || !artistMatch) {
      verification = 'rejected';
    } else if (
      isrcMatch
      || (
        youtubeMusicSong
        && official
        && durationDifference !== null
        && durationDifference <= 0.02
        && !unknownEditionBlocksVerification
      )
    ) {
      verification = 'verified';
    } else if (durationDifference !== null && durationDifference <= 0.05) {
      verification = 'probable';
    } else {
      verification = 'review';
    }

    const candidate: DownloadCandidate = {
      ...raw,
      source,
      edition,
      verification,
      evidence,
      rejectionReasons: evidence.contradictions,
      score,
      label: classifyLabel(evidence),
      confidence: verification === 'verified' ? 'alta' : verification === 'probable' ? 'media' : 'baja',
    };
    const previous = unique.get(candidate.videoId);
    if (!previous || previous.score < candidate.score) unique.set(candidate.videoId, candidate);
  }

  const ranked = [...unique.values()].sort((a, b) => b.score - a.score);
  const hasEditionVariants = new Set(
    ranked.filter((candidate) => candidate.edition !== 'unknown').map((candidate) => candidate.edition),
  ).size > 1;
  if (preference === 'catalog' && (track.edition ?? 'unknown') === 'unknown' && hasEditionVariants) {
    for (const candidate of ranked) {
      if (candidate.verification === 'verified' && !candidate.evidence.isrcMatch) {
        candidate.verification = 'review';
        candidate.confidence = 'baja';
        candidate.rejectionReasons = [...candidate.rejectionReasons, 'catalog_edition_ambiguous'];
      }
    }
  }
  return ranked.slice(0, 3);
}

export function canDownloadWithOneTap(candidate: DownloadCandidate | undefined): boolean {
  return candidate?.verification === 'verified';
}
