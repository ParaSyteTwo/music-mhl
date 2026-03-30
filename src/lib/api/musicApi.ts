import { Track } from '@/types/music';
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

let _supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  _supabaseClient = createClient(supabaseUrl || '', supabaseKey || '', {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _supabaseClient;
}

// ─── Map pre-transformed data from edge function ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProxiedTrack(t: any): Track {
  return {
    id: t.id || `dz-${t.deezerId}`,
    title: t.title || 'Unknown',
    canonicalTitle: t.canonicalTitle || t.title_short || t.title || 'Unknown',
    artist: t.artist || 'Unknown',
    album: t.album || 'Unknown',
    canonicalAlbum: t.canonicalAlbum || t.album || 'Unknown',
    duration: t.duration || 0,
    cover: t.cover || '',
    preview: t.preview || '',
    deezerId: t.deezerId,
  };
}

// ─── Helper: call Supabase edge function for Deezer ───
async function callDeezerProxy(body: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('deezer-search', { body });
  if (error) throw new Error(error.message || 'Edge function error');
  return data;
}

// ─── Deezer Search ───
export async function searchDeezer(query: string, offset = 0, limit = 25): Promise<Track[]> {
  try {
    const data = await callDeezerProxy({ action: 'search', query, limit, offset });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── Deezer Artist Data ───
export async function getDeezerArtist(artistId: string) {
  return callDeezerProxy({ action: 'artist', artistId });
}

// ─── Deezer Album Data ───
export async function getDeezerAlbum(albumId: string) {
  return callDeezerProxy({ action: 'album', albumId });
}

// ─── Genre for a track (via its album) ───
export async function getDeezerTrackGenre(albumId: string | number): Promise<string | null> {
  try {
    const data = await callDeezerProxy({ action: 'album', albumId: String(albumId) });
    return data?.album?.genre || null;
  } catch {
    return null;
  }
}

export interface DownloadCandidate {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  score: number;
  label?: string;
  confidence?: 'alta' | 'media' | 'baja';
}

interface DownloadOptions {
  format?: 'mp3' | 'aac';
  quality?: 'alta' | 'media' | 'baja';
}

const candidateCache = new Map<string, DownloadCandidate[]>();

function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\.?\s+[^-–—,]+/gi, ' ')
    .replace(/\b(remaster(?:ed)?|radio edit|radio version|version|ost|soundtrack)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreferredTrackTitle(track: Track): string {
  return track.canonicalTitle?.trim() || track.title;
}

function getPreferredAlbumName(track: Track): string {
  return track.canonicalAlbum?.trim() || track.album;
}

function looksAnimeLike(track: Track): boolean {
  const source = `${getPreferredTrackTitle(track)} ${track.title} ${track.artist} ${getPreferredAlbumName(track)}`.toLowerCase();
  return /(anime|opening|ending|\bop\b|\bed\b|theme|ost|project|isekai)/.test(source);
}

function buildCandidateQueries(track: Track): string[] {
  const title = normalizeSearchTerm(getPreferredTrackTitle(track));
  const artist = normalizeSearchTerm(track.artist);
  const queries = [
    `${title} ${artist}`,
    `${title} ${artist} official audio`,
  ];
  if (looksAnimeLike(track)) {
    const album = normalizeSearchTerm(getPreferredAlbumName(track));
    queries.push(`${title} full`);
    if (album && album !== title) queries.push(`${title} ${album}`);
  }
  return queries;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('search timeout')), ms),
    ),
  ]);
}

function classifyCandidate(candidate: Pick<DownloadCandidate, 'title' | 'channel'>): string {
  const haystack = `${candidate.title} ${candidate.channel}`.toLowerCase();
  if (/(opening|ending|\bop\b|\bed\b)/.test(haystack)) return 'anime op/ed';
  if (/(cover|fan cover|spanish cover)/.test(haystack)) return 'cover';
  if (/(live|concert|en vivo)/.test(haystack)) return 'live';
  return 'original probable';
}

function scoreNativeCandidate(
  track: Track,
  candidate: Pick<DownloadCandidate, 'title' | 'channel' | 'duration'>,
  queryIndex: number,
): number {
  const title = candidate.title.toLowerCase();
  const normalizedTitle = normalizeSearchTerm(candidate.title);
  const channel = candidate.channel.toLowerCase();
  const wantedTitle = normalizeSearchTerm(getPreferredTrackTitle(track));
  const wantedArtist = normalizeSearchTerm(track.artist);
  const wantedAlbum = normalizeSearchTerm(getPreferredAlbumName(track));
  let score = 100 - queryIndex * 8;

  if (wantedTitle && normalizedTitle === wantedTitle) score += 40;
  else if (wantedTitle && title.includes(wantedTitle)) score += 30;
  if (wantedArtist && title.includes(wantedArtist)) score += 18;
  if (wantedArtist && channel.includes(wantedArtist)) score += 14;
  if (wantedAlbum && title.includes(wantedAlbum)) score += 8;

  if (track.duration > 0 && candidate.duration > 0) {
    const diffPct = Math.abs(candidate.duration - track.duration) / track.duration;
    if (diffPct <= 0.10) score += 24;
    else if (diffPct <= 0.20) score += 10;
    else if (diffPct >= 0.40) score -= 28;
  }

  if (title.includes('official audio')) score += 18;
  if (title.includes('official video')) score += 14;
  if (channel.includes('topic')) score += 10;
  if (channel.includes('official')) score += 8;
  if (/(opening|ending|\bop\b|\bed\b|full version)/.test(title) && looksAnimeLike(track)) score += 15;
  if (/(lyrics|lyric video|sub esp|sub english|subbed)/.test(title)) score -= 12;
  if (/(karaoke|reaction|nightcore|sped up|slowed|8d|instrumental|amv|edit)/.test(title)) score -= 22;
  if (/(dub cover|english dub cover|fan dub)/.test(title)) score -= 24;
  if (title.includes('cover') && !channel.includes(wantedArtist)) score -= 12;
  if (title.includes('live')) score -= 8;
  if (classifyCandidate(candidate) === 'original probable') score += 10;
  if (classifyCandidate(candidate) === 'cover') score -= 10;
  if (classifyCandidate(candidate) === 'live') score -= 8;

  return score;
}

function confidenceFromScore(score: number): 'alta' | 'media' | 'baja' {
  if (score >= 120) return 'alta';
  if (score >= 90) return 'media';
  return 'baja';
}

// ─── Get YouTube candidates for user selection ───
export async function getDownloadCandidates(
  track: Track,
): Promise<DownloadCandidate[]> {
  const cacheKey = `${track.deezerId ?? track.id}|${getPreferredTrackTitle(track)}|${track.artist}|${getPreferredAlbumName(track)}`;
  const cached = candidateCache.get(cacheKey);
  if (cached) return cached;

  if (Capacitor.isNativePlatform()) {
    const { searchYouTubeNative } = await import('@/lib/ytdlpBridge');
    const queries = buildCandidateQueries(track);

    const resultsPerQuery = await Promise.all(
      queries.map((q) => withTimeout(searchYouTubeNative(q), 10000).catch(() => [] as Awaited<ReturnType<typeof searchYouTubeNative>>)),
    );

    const merged = new Map<string, DownloadCandidate>();
    resultsPerQuery.forEach((results, queryIndex) => {
      for (const result of results.slice(0, 5)) {
        const score = scoreNativeCandidate(track, result, queryIndex);
        const current = merged.get(result.videoId);
        const candidate: DownloadCandidate = {
          videoId: result.videoId,
          title: result.title,
          channel: result.channel,
          duration: result.duration,
          score,
          label: classifyCandidate(result),
          confidence: confidenceFromScore(score),
        };
        if (!current || score > current.score) {
          merged.set(result.videoId, candidate);
        }
      }
    });

    const finalCandidates = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    candidateCache.set(cacheKey, finalCandidates);
    return finalCandidates;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/yt-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'getCandidates',
      title: getPreferredTrackTitle(track),
      artist: track.artist,
      album: getPreferredAlbumName(track),
      duration: track.duration ?? 0,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: string; detail?: string } | null;
    throw new Error(err?.error || err?.detail || 'Error obteniendo candidatos');
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || data.detail || 'Sin candidatos');
  const finalCandidates = data.candidates as DownloadCandidate[];
  candidateCache.set(cacheKey, finalCandidates);
  return finalCandidates;
}

interface WebDownloadTicketResponse {
  success: boolean;
  downloadUrl?: string;
  fileName?: string;
  expiresAt?: string;
  error?: string;
}

// ─── Download track audio ───
// Android: yt-dlp local (via YtDlpPlugin nativo)
// Web: Supabase broker issues a short-lived ticket for the external yt-dlp service
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
  videoIdOverride?: string,
): Promise<ArrayBuffer> {
  if (Capacitor.isNativePlatform()) {
    const { searchYouTubeNative, downloadMp3Native } = await import('@/lib/ytdlpBridge');

    onProgress?.(25);

    // Si el usuario eligió un videoId concreto, lo usamos directamente
    if (videoIdOverride) {
      return downloadMp3Native(videoIdOverride, { format: options.format, quality: options.quality });
    }

    const query = `${getPreferredTrackTitle(track)} ${track.artist}`;
    onProgress?.(15);
    const nativeResults = await searchYouTubeNative(`${query} official audio`);
    if (!nativeResults.length) throw new Error('No se encontró en YouTube');

    onProgress?.(25);
    const scored = nativeResults
      .slice(0, 6)
      .map((r) => ({ ...r, dScore: track.duration ? Math.abs(r.duration - track.duration) : 999 }))
      .sort((a, b) => a.dScore - b.dScore)
      .slice(0, 3);
    let lastError = '';

    for (const candidate of scored) {
      try {
        const buffer = await downloadMp3Native(candidate.videoId, {
          format: options.format,
          quality: options.quality,
        });
        return buffer;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Failed';
        continue;
      }
    }
    throw new Error(lastError || 'No se pudo descargar');
  }

  onProgress?.(15);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const ticketRes = await fetch(`${supabaseUrl}/functions/v1/yt-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'webDownloadTicket',
      title: getPreferredTrackTitle(track),
      artist: track.artist,
      album: getPreferredAlbumName(track),
      format: options.format ?? 'mp3',
      duration: track.duration ?? 0,
      ...(videoIdOverride ? { videoId: videoIdOverride } : {}),
    }),
  });

  if (!ticketRes.ok) {
    const err = await ticketRes.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || 'Error descargando audio');
  }

  const ticket = (await ticketRes.json()) as WebDownloadTicketResponse;
  if (!ticket.success || !ticket.downloadUrl) {
    throw new Error(ticket.error || 'No se pudo obtener el ticket de descarga');
  }

  onProgress?.(45);
  const audioRes = await fetch(ticket.downloadUrl);
  if (!audioRes.ok) {
    const err = await audioRes.json().catch(() => ({ error: 'Error descargando audio' }));
    throw new Error(err.error || 'Error descargando audio');
  }

  onProgress?.(85);
  const buffer = await audioRes.arrayBuffer();
  return buffer;
}

// ─── Lyrics (LRCLIB) ───
export async function getLyrics(title: string, artist: string, duration?: number): Promise<{ synced: string | null; plain: string | null }> {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration) params.set('duration', String(Math.round(duration)));
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return { synced: null, plain: null };
    const data = await res.json();
    return {
      synced: data.syncedLyrics || null,
      plain: data.plainLyrics || null,
    };
  } catch {
    return { synced: null, plain: null };
  }
}
