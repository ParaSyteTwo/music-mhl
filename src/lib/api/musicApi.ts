import { Track } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import { useMusicStore } from '@/store/musicStore';
// Detección de pywebview: query param ?platform=pywebview (fiable desde frame 0)
// o window.pywebview si ya está inyectado
function isRunningInPyWebView(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get('platform') === 'pywebview' ||
    'pywebview' in window
  );
}

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform() || isRunningInPyWebView();
}

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

// ─── Helpers para Desktop Python ───────────────────────────────────────────────────────

function cleanTrackTitleForFileName(title: string): string {
  const normalized = title
    .replace(/\s+/g, ' ')
    .replace(/\b(opening|ending)\s+theme\s+song\b/gi, '')
    .replace(/\b(opening|ending)\s+theme\b/gi, '')
    .replace(/\btheme\s+song\b/gi, '')
    .replace(/\b(ost|original soundtrack|soundtrack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = normalized.split(/\s[-–—]\s/);
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    const suffix = rest.join(' - ');
    if (/(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)/i.test(suffix)) {
      return first.trim() || normalized;
    }
  }
  return normalized || title.trim();
}

function buildDownloadFileName(track: Track, fileExtension: string): string {
  const preferredTitle = track.canonicalTitle?.trim() || track.title;
  const cleanTitle = cleanTrackTitleForFileName(preferredTitle);
  return `${cleanTitle} - ${track.artist}.${fileExtension}`
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

// ─── Llamada directa a Deezer: pywebview (bridge Python) o fetch directo ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callDeezerDirect(path: string): Promise<any> {
  if (isRunningInPyWebView()) {
    // Usar el bridge Python — evita CORS en el webview
    const pyapi = (window as any).pywebview?.api;
    if (pyapi) {
      const url = new URL(path, 'https://api.deezer.com');
      const segments = url.pathname.split('/').filter(Boolean);
      // Rutas simples: /search, /track/{id}, /album/{id}, /artist/{id}
      if (segments[0] === 'search') {
        return pyapi.deezer_search(
          url.searchParams.get('q') || '',
          parseInt(url.searchParams.get('limit') || '25'),
          parseInt(url.searchParams.get('index') || '0'),
        );
      }
      if (segments[0] === 'track' && segments[1]) {
        return pyapi.deezer_track(segments[1]);
      }
      if (segments[0] === 'album' && segments[1]) {
        return pyapi.deezer_album(segments[1]);
      }
      if (segments[0] === 'artist' && segments[1] && !segments[2]) {
        return pyapi.deezer_artist(segments[1]);
      }
      // Rutas anidadas (/artist/{id}/top, etc.) no implementadas en bridge — usar fetch (si CORS lo permite)
    }
    // Fallback: fetch directo (funciona si no hay CORS restrictions)
    const res = await fetch(`https://api.deezer.com${path}`);
    return res.json();
  }
  const res = await fetch(`https://api.deezer.com${path}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawDeezerTrack(t: any): Track {
  const artist = t.artist || {};
  const album = t.album || {};
  return {
    id: `dz-${t.id}`,
    deezerId: t.id,
    title: t.title || 'Unknown',
    canonicalTitle: t.title_short || t.title || 'Unknown',
    artist: artist.name || 'Unknown',
    album: album.title || 'Unknown',
    canonicalAlbum: album.title || 'Unknown',
    duration: t.duration || 0,
    cover: album.cover_big || album.cover_medium || album.cover_small || '',
    preview: t.preview || '',
    isrc: t.isrc || '',
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
    if (isNativeApp()) {
      // pywebview/Android: fetch directo a api.deezer.com (sin CORS en desktop nativo)
      const data = await callDeezerDirect(`/search?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`);
      return (data.data || []).map(mapRawDeezerTrack);
    }
    const data = await callDeezerProxy({ action: 'search', query, limit, offset });
    return (data.tracks || []).map(mapProxiedTrack);
  } catch (error) {
    console.error('Deezer search error:', error);
    return [];
  }
}

// ─── Deezer Artist Data ───
export async function getDeezerArtist(artistId: string) {
  if (isRunningInPyWebView()) {
    // Usar el bridge Python que ya hace todas las llamadas internamente
    const pyapi = (window as any).pywebview?.api;
    if (pyapi?.deezer_artist) {
      const result = await pyapi.deezer_artist(artistId);
      if (result.success) {
        return {
          success: true,
          info: { id: result.info.id, name: result.info.name, picture: result.info.picture_xl || result.info.picture_big || '', fans: result.info.nb_fan || 0 },
          topTracks: (result.top?.data || []).map(mapRawDeezerTrack),
          albums: (result.albums?.data || []),
          related: (result.related?.data || []),
        };
      }
      return result;
    }
  }
  if (Capacitor.isNativePlatform()) {
    const [info, top, albums, related] = await Promise.all([
      callDeezerDirect(`/artist/${artistId}`),
      callDeezerDirect(`/artist/${artistId}/top?limit=10`),
      callDeezerDirect(`/artist/${artistId}/albums?limit=10`),
      callDeezerDirect(`/artist/${artistId}/related?limit=8`),
    ]);
    return {
      success: true,
      info: { id: info.id, name: info.name, picture: info.picture_xl || info.picture_big || '', fans: info.nb_fan || 0 },
      topTracks: (top.data || []).map(mapRawDeezerTrack),
      albums: (albums.data || []),
      related: (related.data || []),
    };
  }
  return callDeezerProxy({ action: 'artist', artistId });
}

// ─── Deezer Album Data ───
export async function getDeezerAlbum(albumId: string) {
  return callDeezerProxy({ action: 'album', albumId });
}

// ─── Full metadata for a track (genre, year, track number) ───
export async function getDeezerTrackMeta(trackId: string | number): Promise<{ genre: string | null; year: number | null; trackNumber: number | null }> {
  try {
    if (isNativeApp()) {  // incluye pywebview → callDeezerDirect usa fetch() del webview
      const track = await callDeezerDirect(`/track/${trackId}`);
      const releaseDate: string | undefined = track.release_date;
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
      let genre: string | null = null;
      if (track.album?.id) {
        try {
          const album = await callDeezerDirect(`/album/${track.album.id}`);
          genre = album.genres?.data?.[0]?.name ?? null;
        } catch { /* genre no crítico */ }
      }
      return { genre, year, trackNumber: track.track_position ?? null };
    }
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
    // Anime openings/endings numerados: probar 1-5 automáticamente
    for (const suffix of ['Opening', 'Ending', 'OP', 'ED']) {
      for (let n = 1; n <= 5; n++) {
        queries.push(`${title} ${suffix} ${n}`);
        queries.push(`${title} ${suffix} ${n} full`);
      }
    }
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

  // Detectar si es music video
  const isMusicVideo = /(official music video|music video|\bmv\b|\bm\/v\b)/.test(title);

  if (wantedTitle && normalizedTitle === wantedTitle) score += 40;
  else if (wantedTitle && title.includes(wantedTitle)) score += 30;
  if (wantedArtist && title.includes(wantedArtist)) score += 18;
  if (wantedArtist && channel.includes(wantedArtist)) score += 14;
  if (wantedAlbum && title.includes(wantedAlbum)) score += 8;

  // Duración más estricta: penalizar si difiere mucho
  if (track.duration > 0 && candidate.duration > 0) {
    const diffPct = Math.abs(candidate.duration - track.duration) / track.duration;
    if (diffPct <= 0.02) score += 50;  // ≤2% = canción limpia
    else if (diffPct <= 0.05) score += 30;
    else if (diffPct <= 0.10) score += 15;
    else if (diffPct >= 0.50) score -= 40;
  }

  // Penalizar music videos (tienen intro/outro)
  if (isMusicVideo) score -= 25;

  if (title.includes('official audio')) score += 18;
  if (channel.includes('topic')) score += 10;
  if (channel.includes('official')) score += 8;
  if (/(opening|ending|\bop\b|\bed\b|full version)/.test(title) && looksAnimeLike(track)) score += 15;
  if (/(lyrics|lyric video|sub esp|sub english|subbed)/.test(title)) score -= 12;
  if (/(karaoke|reaction|nightcore|sped up|slowed|8d|instrumental|amv|edit)/.test(title)) score -= 28;
  if (/(dub cover|english dub cover|fan dub)/.test(title)) score -= 24;
  if (title.includes('cover') && !channel.includes(wantedArtist)) score -= 18;
  if (title.includes('live') && !title.includes('official')) score -= 12;

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

  if (isRunningInPyWebView()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).pywebview.api;
      const queries = buildCandidateQueries(track);
      const result = await api.get_candidates({
        title: getPreferredTrackTitle(track),
        artist: track.artist,
        album: getPreferredAlbumName(track),
        duration: track.duration ?? 0,
        isrc: track.isrc || '',
        queries,
      });
      if (!result.success) throw new Error(result.error || 'Error obteniendo candidatos');
      const finalCandidates = result.candidates as DownloadCandidate[];
      if (finalCandidates.length > 0) candidateCache.set(cacheKey, finalCandidates);
      return finalCandidates;
    } catch (err) {
      console.error('[getDownloadCandidates] PyWebView error:', err);
      throw err;
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { searchYouTubeNativeMulti } = await import('@/lib/ytdlpBridge');
      const queries = buildCandidateQueries(track);
      // Más queries para anime (Opening/Ending numerados)
      const maxQueries = looksAnimeLike(track) ? 8 : 4;
      const results = await withTimeout(searchYouTubeNativeMulti(queries.slice(0, maxQueries)), 45000).catch(() => []);
      const merged = new Map<string, DownloadCandidate>();
      for (const result of results.slice(0, 8)) {
        const score = scoreNativeCandidate(track, result, 0);
        const candidate: DownloadCandidate = {
          videoId: result.videoId,
          title: result.title,
          channel: result.channel,
          duration: result.duration,
          score,
          label: classifyCandidate(result),
          confidence: confidenceFromScore(score),
        };
        merged.set(result.videoId, candidate);
      }
      const finalCandidates = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 4);
      if (finalCandidates.length > 0) candidateCache.set(cacheKey, finalCandidates);
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
  downloadUrl?: string;  // Viejo: descarga desde backend
  audioUrl?: string;     // Nuevo (B2): descarga directo de YouTube
  fileName?: string;
  expiresAt?: string;
  error?: string;
}

// ─── Download track audio ───
// Android: yt-dlp local (via YtDlpPlugin nativo)
// Desktop Python: yt-dlp.exe local (via pywebview)
// Web: Railway emite un ticket de descarga de corta duración
export async function downloadTrackAudio(
  track: Track,
  onProgress?: (progress: number) => void,
  options: DownloadOptions = {},
  videoIdOverride?: string,
): Promise<ArrayBuffer> {
  if (isRunningInPyWebView()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).pywebview.api;
    const title = getPreferredTrackTitle(track);
    const artist = track.artist;
    const queries = buildCandidateQueries(track);
    onProgress?.(10);
    const result = await api.get_raw_audio(
      videoIdOverride ?? null,
      title,
      artist,
      queries,
      options.format ?? 'mp3',
      options.quality ?? 'alta',
    );
    if (!result.success) throw new Error(result.error || 'Error descargando audio');
    onProgress?.(85);
    const binary = atob(result.data_b64 as string);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    onProgress?.(95);
    return bytes.buffer as ArrayBuffer;
  }

  if (Capacitor.isNativePlatform()) {
    const { searchYouTubeNativeMulti, downloadMp3Native } = await import('@/lib/ytdlpBridge');

    if (videoIdOverride) {
      onProgress?.(10);
      return downloadMp3Native(videoIdOverride, { format: options.format, quality: options.quality });
    }

    const title = getPreferredTrackTitle(track);
    const artist = track.artist;
    onProgress?.(10);

    // Búsqueda paralela con 3 queries para encontrar mejores candidatos
    const nativeResults = await searchYouTubeNativeMulti([
      `${title} ${artist} official audio`,
      `${title} ${artist} audio`,
      `${title} ${artist}`,
    ]);
    if (!nativeResults.length) throw new Error('No se encontró en YouTube');

    onProgress?.(25);
    // Rankear por cercanía de duración, preferir official audio
    const scored = nativeResults
      .map((r) => ({
        ...r,
        dScore: track.duration ? Math.abs(r.duration - track.duration) : 999,
      }))
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
  if (!ticket.success) {
    throw new Error(ticket.error || 'No se pudo obtener el ticket de descarga');
  }

  // OPCIÓN B2: Si tenemos audioUrl (descarga directa de YouTube)
  if (ticket.audioUrl) {
    console.log('[B2] Usando descarga directa de YouTube URL');
    onProgress?.(45);
    const audioRes = await fetch(ticket.audioUrl);
    if (!audioRes.ok) {
      const text = await audioRes.text().catch(() => '');
      let err: { error?: string; maintenance?: boolean } = {};
      try { err = JSON.parse(text); } catch { /* ignore */ }
      if (err.maintenance) throw new Error('__MAINTENANCE__');
      throw new Error(err.error || 'Error descargando audio');
    }
    onProgress?.(85);
    return audioRes.arrayBuffer();
  }

  // Fallback: descarga tradicional desde backend (downloadUrl)
  if (!ticket.downloadUrl) {
    throw new Error(ticket.error || 'No se pudo obtener URL de descarga');
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

// ─── Lyrics ───
import type { LyricPrefs } from '@/lib/lyricsProcessor'
export type { LyricPrefs }

export async function getLyrics(
  title: string,
  artist: string,
  duration?: number,
  prefs?: LyricPrefs,
): Promise<{ synced: string | null; plain: string | null }> {
  const p = prefs ?? { lyricOriginal: true, lyricRomanization: true, lyricTranslation: true, deviceLang: 'es' }

  if (!p.lyricOriginal && !p.lyricRomanization && !p.lyricTranslation) {
    return { synced: null, plain: null }
  }

  // Fetch LRCLIB y letras.com en paralelo
  const [lrclibResult, letrasResult] = await Promise.allSettled([
    _fetchLrclib(title, artist, duration),
    (async () => {
      // letras.com solo funciona bien en Android (sin CORS)
      // En web puede fallar, usamos try/catch
      try {
        const { fetchLetrasLyrics } = await import('@/lib/letrasScraper')
        return await fetchLetrasLyrics(title, artist)
      } catch {
        return null
      }
    })(),
  ])

  // Procesar LRCLIB para obtener timestamps y línea original
  const lrclib = lrclibResult.status === 'fulfilled' ? lrclibResult.value : null
  const letras = letrasResult.status === 'fulfilled' ? letrasResult.value : null

  // Decidir qué fuentes usar para cada capa
  // letras.com tiene mejor calidad humana para original + traducción ES
  // LRCLIB tiene timestamps para sincronización

  if (letras?.original && letras.original.length > 0) {
    // Tenemos letras.com — combinar con timestamps de LRCLIB
    const result = _combineLyrics(letras, lrclib, p)
    if (result) return result
  }

  // Fallback a LRCLIB directo con romanización
  if (lrclib?.syncedLrc || lrclib?.plainLrc) {
    try {
      const { processLyrics } = await import('@/lib/lyricsProcessor')
      return await processLyrics(lrclib.syncedLrc || '', lrclib.plainLrc || '', p)
    } catch {
      return { synced: null, plain: null }
    }
  }

  return { synced: null, plain: null }
}

interface LrclibResult {
  syncedLrc: string
  plainLrc: string
}

async function _fetchLrclib(title: string, artist: string, duration?: number): Promise<LrclibResult> {
  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (duration) params.set('duration', String(Math.round(duration)))
  const res = await fetch(`https://lrclib.net/api/get?${params}`)
  if (!res.ok) return { syncedLrc: '', plainLrc: '' }
  const data = await res.json()
  return {
    syncedLrc: data.syncedLyrics || '',
    plainLrc: data.plainLyrics || '',
  }
}

interface LetrasResult {
  original: string[]
  romaji: string[]
  translated: string[]
  sourceUrl: string
}

function _combineLyrics(
  letras: LetrasResult,
  lrclib: LrclibResult | null,
  p: LyricPrefs,
): { synced: string | null; plain: string | null } | null {
  if (letras.original.length === 0) return null

  // Generar timestamps si tenemos LRC de LRCLIB, si no crear fijos cada 3s
  let timestamps: string[] | null = null
  if (lrclib?.syncedLrc) {
    const LRC_RE = /^\[(\d+:\d+\.\d+)\]/g
    const matches = [...lrclib.syncedLrc.matchAll(LRC_RE)]
    if (matches.length >= letras.original.length * 0.5) {
      timestamps = matches.map(m => m[1])
    }
  }

  const result: string[] = []
  const maxLines = Math.max(
    letras.original.length,
    letras.romaji.length || 0,
    letras.translated.length || 0,
  )

  for (let i = 0; i < maxLines; i++) {
    // Timestamp — usar el de LRCLIB si existe, si no estimator
    const ts = timestamps?.[i] ?? `[${String(Math.floor(i / 20) + 0).padStart(2, '0')}:${String((i % 20) * 3).padStart(2, '0')}.00]`

    if (p.lyricOriginal && letras.original[i]) {
      result.push(`[${ts}]${letras.original[i]}`)
    }

    if (p.lyricRomanization && letras.romaji[i]) {
      result.push(`[${ts}]${letras.romaji[i]}`)
    }

    if (p.lyricTranslation && letras.translated[i]) {
      result.push(`[${ts}]${letras.translated[i]}`)
    }
  }

  return { synced: result.join('\n'), plain: result.join('\n') }
}
