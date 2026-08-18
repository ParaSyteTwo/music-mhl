import type { Track, TrackEdition } from '@/types/music';

export const CANDIDATE_RESOLVER_VERSION = 5;

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
  ['radio_edit', /\b(radio edit|radio version|single edit)\b/i],
  ['extended', /\b(extended|extended version|extended mix)\b/i],
  ['acoustic', /\b(acoustic|unplugged)\b/i],
  ['first_take', /\b(?:from\s+)?the first take\b/i],
  ['remaster', /\b(remaster(?:ed)?(?:\s+\d{4})?)\b/i],
  ['music_video', /\b(official music video|music video|m\/v|visualizer)\b/i],
];

const FEATURED_ARTIST_RE = /\b(?:feat(?:uring)?|ft|with)\.?\s+([^()[\]–—-]+)/i;

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

function featuredArtist(value: string): string {
  return normalizeCandidateText(FEATURED_ARTIST_RE.exec(value)?.[1] ?? '');
}

function variantReasons(value: string): string[] {
  return ALTERED_PATTERNS
    .filter(([reason, pattern]) => reason !== 'music_video' && pattern.test(value))
    .map(([reason]) => reason);
}

function additionalStructuredArtists(value: string, primaryArtist: string): string {
  if (!value.includes(',') && !value.includes(';')) return '';
  const primary = normalizeCandidateText(primaryArtist);
  return value
    .split(/[,;]/)
    .map((artist) => normalizeCandidateText(artist))
    .filter((artist) => artist && !containsWords(primary, artist) && !containsWords(artist, primary))
    .join(' ');
}

function compareRequestedVariant(track: Track, raw: RawDownloadCandidate): string[] {
  const requested = `${track.title} ${track.canonicalTitle ?? ''}`;
  const candidate = raw.title;
  const requestedVariants = new Set(variantReasons(requested));
  const candidateVariants = new Set(variantReasons(candidate));
  const contradictions: string[] = [];

  for (const variant of candidateVariants) {
    if (!requestedVariants.has(variant)) contradictions.push(variant);
  }
  for (const variant of requestedVariants) {
    if (!candidateVariants.has(variant)) contradictions.push(`missing_${variant}`);
  }

  const requestedFeature = featuredArtist(requested);
  const candidateFeature = (
    featuredArtist(candidate)
    || additionalStructuredArtists(raw.artist ?? '', track.artist)
  );
  if (requestedFeature && candidateFeature !== requestedFeature) {
    contradictions.push(candidateFeature ? 'featured_artist_mismatch' : 'featured_artist_missing');
  } else if (!requestedFeature && candidateFeature) {
    contradictions.push('featured_artist_unspecified');
  }
  return contradictions;
}

function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const wanted = needle.split(' ').filter(Boolean);
  return wanted.length > 0 && wanted.every((word) => haystack.split(' ').includes(word));
}

function inferEdition(candidate: RawDownloadCandidate): TrackEdition {
  if (candidate.edition && candidate.edition !== 'unknown') return candidate.edition;
  const text = `${candidate.title} ${candidate.album ?? ''}`.toLocaleLowerCase();
  if (/\b(clean|censored)\b/.test(text)) return 'clean';
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
  if (evidence.youtubeMusicSong) return 'Canción de YouTube Music';
  return 'Revisar coincidencia';
}

function semanticIdentity(track: Track, candidate: DownloadCandidate): string {
  const requestedTitle = normalizeCandidateText(track.canonicalTitle?.trim() || track.title);
  const normalizedTitle = normalizeCandidateText(candidate.title);
  const baseTitle = candidate.evidence.titleMatch ? requestedTitle : normalizedTitle;
  const variants = variantReasons(candidate.title).sort().join(',');
  const feature = (
    featuredArtist(candidate.title)
    || additionalStructuredArtists(candidate.artist ?? '', track.artist)
  );
  return `${baseTitle}|variant:${variants}|feature:${feature}`;
}

function deduplicateSemanticCandidates(
  track: Track,
  ranked: DownloadCandidate[],
): DownloadCandidate[] {
  const groups = new Map<string, DownloadCandidate[]>();
  for (const candidate of ranked) {
    const key = semanticIdentity(track, candidate);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const result: DownloadCandidate[] = [];
  for (const group of groups.values()) {
    const knownEditions = new Set(
      group
        .map((candidate) => candidate.edition)
        .filter((edition) => edition !== 'unknown'),
    );
    if (knownEditions.size <= 1) {
      result.push(group[0]);
      continue;
    }

    for (const edition of knownEditions) {
      const candidate = group.find((item) => item.edition === edition);
      if (candidate) result.push(candidate);
    }
  }
  return result.sort((a, b) => b.score - a.score);
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
  const firstYouTubeMusicSongIndex = rawCandidates.findIndex((candidate) => (
    (candidate.source ?? 'youtube') === 'youtube_music'
    && (!candidate.resultType || /song|track/i.test(candidate.resultType))
  ));

  for (const [rawIndex, raw] of rawCandidates.entries()) {
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
        if (reason !== 'music_video') return false;
        if (!pattern.test(`${raw.title} ${raw.channel}`) || pattern.test(requestedEditionText)) return false;
        return reason !== 'music_video' || durationDifference === null || durationDifference > 0.02;
      })
      .map(([reason]) => reason);
    contradictions.push(...compareRequestedVariant(track, raw));
    const titleMatch = title === wantedTitle || containsWords(title, wantedTitle);
    const artistMatch = containsWords(combined, wantedArtist);
    const albumMatch = Boolean(wantedAlbum) && (
      candidateAlbum === wantedAlbum || containsWords(`${title} ${candidateAlbum}`, wantedAlbum)
    );
    const youtubeMusicSong = source === 'youtube_music' && (!raw.resultType || /song|track/i.test(raw.resultType));
    const catalogArtistMatch = Boolean(candidateArtist) && containsWords(candidateArtist, wantedArtist);
    const hasArtistEvidence = Boolean(candidateArtist || channel);
    const artistContradiction = hasArtistEvidence && !artistMatch;
    const firstYouTubeMusicSong = youtubeMusicSong && rawIndex === firstYouTubeMusicSongIndex;
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
    if (
      !youtubeMusicSong
      && durationDifference !== null
      && durationDifference > 0.12
    ) {
      contradictions.push('duration_incompatible');
    }

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

    let score = Math.max(0, 20 - rawIndex);
    if (youtubeMusicSong) score += 300;
    if (firstYouTubeMusicSong) score += 500;
    if (titleMatch) score += 200;
    if (artistMatch) score += 40;
    if (albumMatch) score += 10;
    if (official) score += 10;
    if (!youtubeMusicSong && durationDifference !== null) {
      if (durationDifference <= 0.02) score += 30;
      else if (durationDifference <= 0.05) score += 15;
      else if (durationDifference > 0.12) score -= 35;
    }
    if (editionMatch === true) score += 10;
    if (isrcMatch) score += 2000;
    score -= evidence.contradictions.length * 600;

    let verification: CandidateVerification;
    if (evidence.contradictions.length > 0) {
      verification = 'rejected';
    } else if (
      isrcMatch
      || (youtubeMusicSong && (firstYouTubeMusicSong || titleMatch))
    ) {
      verification = 'verified';
    } else if (!titleMatch || artistContradiction) {
      verification = 'rejected';
    } else if (
      durationDifference !== null && durationDifference <= 0.05
    ) {
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
      label: firstYouTubeMusicSong && verification === 'verified'
        ? 'Primera canción de YouTube Music'
        : classifyLabel(evidence),
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
  return deduplicateSemanticCandidates(track, ranked).slice(0, 3);
}

export function canDownloadWithOneTap(candidate: DownloadCandidate | undefined): boolean {
  if (!candidate) return false;
  // Auto-download unless there are explicitly rejected contradictions (like missing features/variants)
  return candidate.verification === 'verified' || candidate.verification === 'probable' || (candidate.score > 0 && candidate.rejectionReasons.length === 0);
}
