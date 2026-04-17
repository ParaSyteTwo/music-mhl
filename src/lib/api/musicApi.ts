import { Track } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import { useMusicStore } from '@/store/musicStore';

function getRailwayUrl(): string {
  return (import.meta.env.VITE_RAILWAY_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

function getRailwayKey(): string {
  return (import.meta.env.VITE_SERVICE_API_KEY as string | undefined) ?? '';
}

function railwayHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getRailwayKey()}`,
  };
}

// ─── Map pre-transformed data from backend ───
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

// ─── Helper: call Railway /deezer endpoint ───
async function callDeezerProxy(body: Record<string, unknown>) {
  const res = await fetch(`${getRailwayUrl()}/deezer`, {
    method: 'POST',
    headers: railwayHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let err: { error?: string; detail?: string } | null = null;
    try { err = JSON.parse(text); } catch { /* ignore */ }
    throw new Error(err?.error || err?.detail || 'Deezer proxy error');
  }
  if (!text) throw new Error('Empty response from Deezer proxy');
  return JSON.parse(text);
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

// ─── YouTube Direct Search (offline-capable via yt-dlp) ───
export async function searchYouTubeDirect(query: string): Promise<Track[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { searchYouTubeDirect: searchYT } = await import('@/lib/ytdlpBridge');
    return searchYT(query);
  } catch {
    return [];
  }
}

export type SearchSource = 'local' | 'deezer' | 'youtube';

export interface SearchResult {
  tracks: Track[];
  source: SearchSource;
  total: number;
}

// ─── Parallel multi-source search (all at once for maximum speed) ───
export async function searchWithFallback(
  query: string,
  localLibrary: Track[],
): Promise<{ tracks: Track[]; sources: SearchSource[]; hasLocal: boolean }> {
  if (!query.trim()) return { tracks: [], sources: [], hasLocal: false };

  // Always search local library instantly (~0ms)
  const { searchLocalTracks } = await import('@/lib/searchEngine');
  const localResults = searchLocalTracks(localLibrary, query);

  const sources: SearchSource[] = ['local'];
  const allTracks: Track[] = [...localResults];

  // Deduplicate by title+artist
  const seen = new Set<string>();
  allTracks.forEach((t) => seen.add(`${t.title.toLowerCase()}|${t.artist.toLowerCase()}`));

  // Launch all remote searches in parallel
  const [deezerResults, youtubeResults] = await Promise.allSettled([
    navigator.onLine ? searchDeezer(query) : Promise.reject('offline'),
    Capacitor.isNativePlatform() ? searchYouTubeDirect(query) : Promise.reject('not native'),
  ]);

  if (deezerResults.status === 'fulfilled' && deezerResults.value.length > 0) {
    sources.push('deezer');
    deezerResults.value.forEach((t) => {
      const key = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allTracks.push(t);
      }
    });
  }

  if (youtubeResults.status === 'fulfilled' && youtubeResults.value.length > 0) {
    sources.push('youtube');
    youtubeResults.value.forEach((t) => {
      const key = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allTracks.push(t);
      }
    });
  }

  return { tracks: allTracks, sources, hasLocal: localResults.length > 0 };
}

// ─── Enrich a YouTube track with Deezer metadata when available ───
export async function enrichWithDeezerMeta(track: Track): Promise<Track> {
  if (!track.deezerId || !navigator.onLine) return track;
  try {
    const meta = await getDeezerTrackMeta(track.deezerId);
    return {
      ...track,
      genre: meta.genre ?? track.genre,
    };
  } catch {
    return track;
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

// ─── Full metadata for a track (genre, year, track number) ───
export async function getDeezerTrackMeta(trackId: string | number): Promise<{ genre: string | null; year: number | null; trackNumber: number | null }> {
  try {
    const data = await callDeezerProxy({ action: 'trackMeta', trackId: String(trackId) });
    return {
      genre: data?.genre || null,
      year: data?.year || null,
      trackNumber: data?.trackNumber || null,
    };
  } catch {
    return { genre: null, year: null, trackNumber: null };
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
  if (cached && cached.length > 0) return cached;

  if (Capacitor.isNativePlatform()) {
    try {
      const { searchYouTubeNative } = await import('@/lib/ytdlpBridge');
      const queries = buildCandidateQueries(track);
      console.log('[getDownloadCandidates] Native platform detected. Queries:', queries);

      const resultsPerQuery = await Promise.all(
        queries.map((q) => {
          console.log('[searchYouTubeNative] Starting search for query:', q);
          return withTimeout(searchYouTubeNative(q), 30000)
            .catch((err) => {
              console.error('[searchYouTubeNative] Error for query', q, ':', err);
              return [] as Awaited<ReturnType<typeof searchYouTubeNative>>;
            });
        }),
      );

      console.log('[getDownloadCandidates] All results:', resultsPerQuery);

      const merged = new Map<string, DownloadCandidate>();
      resultsPerQuery.forEach((results, queryIndex) => {
        console.log('[getDownloadCandidates] Processing query index', queryIndex, '- got', results.length, 'results');
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
      console.log('[getDownloadCandidates] Final candidates:', finalCandidates);
      if (finalCandidates.length > 0) {
        candidateCache.set(cacheKey, finalCandidates);
      }
      return finalCandidates;
    } catch (err) {
      console.error('[getDownloadCandidates] Native error:', err);
      throw err;
    }
  }

  // Web: llamar Railway /candidates directamente
  const res = await fetch(`${getRailwayUrl()}/candidates`, {
    method: 'POST',
    headers: railwayHeaders(),
    body: JSON.stringify({
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
// Web: Railway emite un ticket de descarga de corta duración
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
  videoIdOverride?: string,
): Promise<ArrayBuffer> {
  if (Capacitor.isNativePlatform()) {
    const { searchYouTubeNative, downloadMp3Native } = await import('@/lib/ytdlpBridge');

    onProgress?.(25);

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
    let autoUpdated = false;

    for (const candidate of scored) {
      try {
        const buffer = await downloadMp3Native(candidate.videoId, {
          format: options.format,
          quality: options.quality,
        });
        return buffer;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Failed';
        const isOutdated = /403|forbidden|outdated|older than/i.test(lastError);
        if (isOutdated && !autoUpdated) {
          autoUpdated = true;
          try {
            const { updateYtDlp } = await import('@/lib/ytdlpBridge');
            await updateYtDlp();
            useMusicStore.getState().setYtDlpUpdateAvailable(false);
          } catch { /* update failure is non-fatal */ }
        }
        continue;
      }
    }
    throw new Error(lastError || 'No se pudo descargar');
  }

  // Web: obtener ticket de Railway y luego descargar
  onProgress?.(15);

  const ticketRes = await fetch(`${getRailwayUrl()}/download-ticket`, {
    method: 'POST',
    headers: railwayHeaders(),
    body: JSON.stringify({
      title: getPreferredTrackTitle(track),
      artist: track.artist,
      album: getPreferredAlbumName(track),
      format: options.format ?? 'mp3',
      duration: track.duration ?? 0,
      ...(videoIdOverride ? { videoId: videoIdOverride } : {}),
    }),
  });

  if (!ticketRes.ok) {
    const text = await ticketRes.text().catch(() => '');
    let err: { error?: string; maintenance?: boolean } = {};
    try { err = JSON.parse(text); } catch { /* ignore */ }
    if (err.maintenance) throw new Error('__MAINTENANCE__');
    throw new Error(err.error || 'Error descargando audio');
  }

  const ticket = (await ticketRes.json()) as WebDownloadTicketResponse;
  if (!ticket.success || !ticket.downloadUrl) {
    throw new Error(ticket.error || 'No se pudo obtener el ticket de descarga');
  }

  onProgress?.(45);
  const audioRes = await fetch(ticket.downloadUrl);
  if (!audioRes.ok) {
    const text = await audioRes.text().catch(() => '');
    let err: { error?: string; maintenance?: boolean } = {};
    try { err = JSON.parse(text); } catch { /* ignore */ }
    if (err.maintenance) throw new Error('__MAINTENANCE__');
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
