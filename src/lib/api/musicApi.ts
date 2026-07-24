import { Track } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import type { Anime, AnimeTheme } from '@/types/anime';
import { looksAnimeLike } from '@/lib/util/animeDetector';
import { decodeBase64ArrayBuffer } from '@/lib/binaryEncoding';
import {
  CANDIDATE_RESOLVER_VERSION,
  resolveDownloadCandidates,
  type DownloadCandidate,
  type EditionPreference,
  type RawDownloadCandidate,
} from '@/lib/download/candidateResolver';

export type { DownloadCandidate } from '@/lib/download/candidateResolver';

export { looksAnimeLike };

interface PyWebViewApi {
  anime_search?: (query: string, limit: number) => Promise<{ success: boolean; error?: string; results?: Anime[] }>
  anime_get_themes?: (anilistId: number) => Promise<{ success: boolean; error?: string; themes?: AnimeTheme[] }>
  deezer_search?: (query: string, limit: number, index: number) => Promise<unknown>
  deezer_track?: (trackId: string) => Promise<unknown>
  deezer_album?: (albumId: string) => Promise<unknown>
  deezer_artist?: (artistId: string) => Promise<{
    success?: boolean
    info?: {
      id?: string | number
      name?: string
      picture_xl?: string
      picture_big?: string
      nb_fan?: number
    }
    top?: { data?: RawDeezerTrack[] }
    albums?: { data?: unknown[] }
    related?: { data?: unknown[] }
  }>
}

interface PyWebViewWindow extends Window {
  pywebview?: {
    api?: PyWebViewApi
  }
}

interface ProxiedTrack {
  id?: string
  deezerId?: string | number
  title?: string
  title_short?: string
  canonicalTitle?: string
  artist?: string
  album?: string
  canonicalAlbum?: string
  duration?: number
  cover?: string
  preview?: string
  edition?: Track['edition']
}

interface RawDeezerTrack {
  id?: string | number
  title?: string
  title_short?: string
  artist?: { name?: string }
  album?: {
    id?: string | number
    title?: string
    cover_big?: string
    cover_medium?: string
    cover_small?: string
  }
  duration?: number
  preview?: string
  isrc?: string
  explicit_lyrics?: boolean
  release_date?: string
  track_position?: number
}

interface RawDeezerArtist {
  id?: string | number
  name?: string
  picture_xl?: string
  picture_big?: string
  nb_fan?: number
}

interface RawDeezerList<T> {
  data?: T[]
}

interface RawDeezerAlbum {
  id?: string | number
  genres?: { data?: Array<{ name?: string }> }
}
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

export class DesktopBridgeUnavailableError extends Error {
  constructor() {
    super('PyWebView desktop bridge is unavailable');
    this.name = 'DesktopBridgeUnavailableError';
  }
}

export function requirePyWebViewApi(): PyWebViewApi {
  const api = (typeof window === 'undefined' ? undefined : (window as PyWebViewWindow).pywebview?.api);
  if (!api) throw new DesktopBridgeUnavailableError();
  return api;
}

export function getRailwayUrl(): string {
  return (import.meta.env.VITE_RAILWAY_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

export function getRailwayKey(): string {
  return (import.meta.env.VITE_SERVICE_API_KEY as string | undefined) ?? '';
}

export function railwayHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getRailwayKey()}`,
  };
}

// ─── Helpers para Desktop Python ───────────────────────────────────────────────────────

// ─── Map pre-transformed data from backend ───
function mapProxiedTrack(t: ProxiedTrack): Track {
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
    deezerId: t.deezerId == null ? undefined : Number(t.deezerId),
    edition: t.edition ?? 'unknown',
  };
}

// ─── Llamada directa a Deezer: pywebview (bridge Python) o fetch directo ───
async function callDeezerDirect<T = unknown>(path: string): Promise<T> {
  if (isRunningInPyWebView()) {
    // Usar el bridge Python — evita CORS en el webview
    const pyapi = (window as PyWebViewWindow).pywebview?.api;
    if (pyapi) {
      const url = new URL(path, 'https://api.deezer.com');
      const segments = url.pathname.split('/').filter(Boolean);
      // Rutas simples: /search, /track/{id}, /album/{id}, /artist/{id}
      if (segments[0] === 'search') {
        return await pyapi.deezer_search?.(
          url.searchParams.get('q') || '',
          parseInt(url.searchParams.get('limit') || '25'),
          parseInt(url.searchParams.get('index') || '0'),
        ) as T;
      }
      if (segments[0] === 'track' && segments[1]) {
        return await pyapi.deezer_track?.(segments[1]) as T;
      }
      if (segments[0] === 'album' && segments[1]) {
        return await pyapi.deezer_album?.(segments[1]) as T;
      }
      if (segments[0] === 'artist' && segments[1] && !segments[2]) {
        return await pyapi.deezer_artist?.(segments[1]) as T;
      }
      // Rutas anidadas (/artist/{id}/top, etc.) no implementadas en bridge — usar fetch (si CORS lo permite)
    }
    // Fallback: fetch directo (funciona si no hay CORS restrictions)
    const res = await fetch(`https://api.deezer.com${path}`);
    return await res.json() as T;
  }
  const res = await fetch(`https://api.deezer.com${path}`);
  return await res.json() as T;
}

function mapRawDeezerTrack(t: RawDeezerTrack): Track {
  const artist = t.artist || {};
  const album = t.album || {};
  return {
    id: `dz-${t.id}`,
    deezerId: t.id == null ? undefined : Number(t.id),
    title: t.title || 'Unknown',
    canonicalTitle: t.title_short || t.title || 'Unknown',
    artist: artist.name || 'Unknown',
    album: album.title || 'Unknown',
    canonicalAlbum: album.title || 'Unknown',
    duration: t.duration || 0,
    cover: album.cover_big || album.cover_medium || album.cover_small || '',
    preview: t.preview || '',
    isrc: t.isrc || '',
    edition: t.explicit_lyrics === true ? 'explicit' : t.explicit_lyrics === false ? 'clean' : 'unknown',
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
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return [];

  const cacheKey = `${normalizedQuery.toLocaleLowerCase()}|${offset}|${limit}`;
  const cached = getCachedValue(searchCache, cacheKey);
  if (cached) return cached;

  const pending = searchRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    try {
      let tracks: Track[];
      if (isNativeApp()) {
        const data = await callDeezerDirect<{ data?: RawDeezerTrack[] }>(`/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}&index=${offset}`);
        tracks = (data.data || []).map(mapRawDeezerTrack);
      } else {
        const data = await callDeezerProxy({ action: 'search', query: normalizedQuery, limit, offset });
        tracks = (data.tracks || []).map(mapProxiedTrack);
      }
      setCachedValue(searchCache, cacheKey, tracks, SEARCH_CACHE_TTL_MS, SEARCH_CACHE_MAX_ENTRIES);
      return tracks;
    } catch (error) {
      console.error('Deezer search error:', error);
      return [];
    } finally {
      searchRequests.delete(cacheKey);
    }
  })();

  searchRequests.set(cacheKey, request);
  return request;
}

// ─── Deezer Artist Data ───
export async function getDeezerArtist(artistId: string) {
  if (isRunningInPyWebView()) {
    // Usar el bridge Python que ya hace todas las llamadas internamente
    const pyapi = (window as PyWebViewWindow).pywebview?.api;
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
      callDeezerDirect<RawDeezerArtist>(`/artist/${artistId}`),
      callDeezerDirect<RawDeezerList<RawDeezerTrack>>(`/artist/${artistId}/top?limit=10`),
      callDeezerDirect<RawDeezerList<unknown>>(`/artist/${artistId}/albums?limit=10`),
      callDeezerDirect<RawDeezerList<unknown>>(`/artist/${artistId}/related?limit=8`),
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
      const track = await callDeezerDirect<RawDeezerTrack>(`/track/${trackId}`);
      const releaseDate: string | undefined = track.release_date;
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
      let genre: string | null = null;
      if (track.album?.id) {
        try {
          const album = await callDeezerDirect<RawDeezerAlbum>(`/album/${track.album.id}`);
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

export type DownloadErrorCode =
  | 'network'
  | 'rate_limit'
  | 'candidate_invalid'
  | 'edition_incompatible'
  | 'extraction'
  | 'conversion'
  | 'metadata'
  | 'write';

export class DownloadFailure extends Error {
  constructor(public readonly code: DownloadErrorCode, message: string) {
    super(message);
    this.name = 'DownloadFailure';
  }
}

export interface CandidateSearchOptions {
  depth?: 'light' | 'deep';
  editionPreference?: EditionPreference;
}

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const CANDIDATE_CACHE_TTL_MS = 72 * 60 * 60 * 1000;
const EMPTY_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1000;
const PERSISTENT_CANDIDATE_CACHE_TTL_MS = 72 * 60 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const CANDIDATE_CACHE_MAX_ENTRIES = 200;
const PERSISTENT_CANDIDATE_CACHE_MAX_ENTRIES = 200;
const PERSISTENT_CANDIDATE_CACHE_KEY = `mhl-native-candidate-cache-v${CANDIDATE_RESOLVER_VERSION}`;
const ANDROID_NORMAL_CANDIDATE_LIMIT = 8;
const ANDROID_FAST_CANDIDATE_LIMIT = 3;
const ANDROID_EXTRA_CANDIDATE_LIMIT = 5;

const searchCache = new Map<string, TimedCacheEntry<Track[]>>();
const searchRequests = new Map<string, Promise<Track[]>>();
const candidateCache = new Map<string, TimedCacheEntry<DownloadCandidate[]>>();
const candidateRequests = new Map<string, Promise<DownloadCandidate[]>>();
const candidatePrefetchRequests = new Set<string>();
let activeCandidatePrefetches = 0;

function getCachedValue<T>(cache: Map<string, TimedCacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedValue<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
  maxEntries: number,
): void {
  if (!cache.has(key) && cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function canUsePersistentCandidateCache(): boolean {
  return typeof localStorage !== 'undefined' && isNativeApp();
}

function readPersistentCandidateCache(): Record<string, TimedCacheEntry<DownloadCandidate[]>> {
  if (!canUsePersistentCandidateCache()) return {};
  try {
    return JSON.parse(localStorage.getItem(PERSISTENT_CANDIDATE_CACHE_KEY) || '{}') as Record<string, TimedCacheEntry<DownloadCandidate[]>>;
  } catch {
    return {};
  }
}

function writePersistentCandidateCache(entries: Record<string, TimedCacheEntry<DownloadCandidate[]>>): void {
  if (!canUsePersistentCandidateCache()) return;
  try {
    localStorage.setItem(PERSISTENT_CANDIDATE_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Cache persistence is a speed hint only.
  }
}

function getPersistentCandidateCacheValue(key: string): DownloadCandidate[] | undefined {
  const entries = readPersistentCandidateCache();
  const entry = entries[key];
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    delete entries[key];
    writePersistentCandidateCache(entries);
    return undefined;
  }
  return entry.value;
}

function setPersistentCandidateCacheValue(key: string, value: DownloadCandidate[]): void {
  const entries = readPersistentCandidateCache();
  const sorted = Object.entries(entries)
    .filter(([, entry]) => entry.expiresAt > Date.now())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (!entries[key] && sorted.length >= PERSISTENT_CANDIDATE_CACHE_MAX_ENTRIES) {
    const [oldestKey] = sorted.shift() ?? [];
    if (oldestKey) delete entries[oldestKey];
  }
  entries[key] = {
    value,
    expiresAt: Date.now() + (value.length > 0 ? PERSISTENT_CANDIDATE_CACHE_TTL_MS : EMPTY_CANDIDATE_CACHE_TTL_MS),
  };
  writePersistentCandidateCache(entries);
}

function getAndroidPrimaryCandidateLimit(options: CandidateSearchOptions = {}): number {
  return options.depth === 'light'
    ? ANDROID_FAST_CANDIDATE_LIMIT
    : ANDROID_NORMAL_CANDIDATE_LIMIT;
}

function buildCandidateCacheKey(
  track: Track,
  animeSearchEnabled: boolean,
  expanded: boolean,
  options: CandidateSearchOptions = {},
): string {
  return `r${CANDIDATE_RESOLVER_VERSION}|${track.isrc || track.deezerId || track.id}|${getPreferredTrackTitle(track)}|${track.artist}|${getPreferredAlbumName(track)}|edition:${track.edition ?? 'unknown'}|preference:${options.editionPreference ?? 'catalog'}|anime:${animeSearchEnabled}|deep:${expanded || options.depth === 'deep'}`;
}

function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(ost|original soundtrack|soundtrack)\b/gi, ' ')
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

function shouldUseAnimeEnhancements(track: Track, animeSearchEnabled: boolean): boolean {
  return animeSearchEnabled && looksAnimeLike(track);
}

function pushUniqueQuery(queries: string[], query: string): void {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (normalized && !queries.includes(normalized)) queries.push(normalized);
}

function buildCandidateQueries(track: Track, animeSearchEnabled: boolean): string[] {
  const title = normalizeSearchTerm(getPreferredTrackTitle(track));
  const artist = normalizeSearchTerm(track.artist);
  const queries = [
    `${title} ${artist} official audio`,
    `${title} ${artist}`,
  ];
  if (shouldUseAnimeEnhancements(track, animeSearchEnabled)) {
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

function buildAndroidCandidateQueries(track: Track, animeSearchEnabled: boolean): string[] {
  const title = normalizeSearchTerm(getPreferredTrackTitle(track));
  const artist = normalizeSearchTerm(track.artist);
  const queries: string[] = [];
  pushUniqueQuery(queries, `${artist} - ${title} official audio`);
  pushUniqueQuery(queries, `${artist} ${title} official audio`);
  pushUniqueQuery(queries, `${title} ${artist} official audio`);
  pushUniqueQuery(queries, `${title} ${artist}`);
  if (shouldUseAnimeEnhancements(track, animeSearchEnabled)) {
    const album = normalizeSearchTerm(getPreferredAlbumName(track));
    pushUniqueQuery(queries, `${title} full`);
    if (album && album !== title) pushUniqueQuery(queries, `${title} ${album}`);
    // Anime openings/endings numerados: probar 1-5 automáticamente
    for (const suffix of ['Opening', 'Ending', 'OP', 'ED']) {
      for (let n = 1; n <= 5; n++) {
        pushUniqueQuery(queries, `${title} ${suffix} ${n}`);
        pushUniqueQuery(queries, `${title} ${suffix} ${n} full`);
      }
    }
  }
  return queries;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('search timeout')), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function rankDownloadCandidates(
  track: Track,
  candidates: Array<RawDownloadCandidate & Partial<DownloadCandidate>>,
  animeSearchEnabled = false,
): DownloadCandidate[] {
  void animeSearchEnabled;
  return resolveDownloadCandidates(track, candidates, { editionPreference: 'catalog' });
}

function shouldExpandCandidateSearch(candidates: Array<Partial<DownloadCandidate>>): boolean {
  return candidates.length < 2 || candidates[0]?.confidence !== 'alta';
}

// ─── Get YouTube candidates for user selection ───
async function fetchDownloadCandidates(
  track: Track,
  animeSearchEnabled: boolean,
  expanded = false,
  options: CandidateSearchOptions = {},
): Promise<DownloadCandidate[]> {
  const cacheKey = buildCandidateCacheKey(track, animeSearchEnabled, expanded, options);
  const cached = getCachedValue(candidateCache, cacheKey);
  if (cached) return cached;
  const persistentCached = getPersistentCandidateCacheValue(cacheKey);
  if (persistentCached) {
    setCachedValue(candidateCache, cacheKey, persistentCached, CANDIDATE_CACHE_TTL_MS, CANDIDATE_CACHE_MAX_ENTRIES);
    return persistentCached;
  }

  if (isRunningInPyWebView()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).pywebview.api;
      const queries = buildCandidateQueries(track, animeSearchEnabled);
      const result = await api.get_candidates({
        title: getPreferredTrackTitle(track),
        artist: track.artist,
        album: getPreferredAlbumName(track),
        duration: track.duration ?? 0,
        isrc: track.isrc || '',
        queries,
        animeSearchEnabled,
        source: 'youtube_music',
        depth: expanded || options.depth === 'deep' ? 'deep' : 'light',
      });
      if (!result.success) throw new Error(result.error || 'Error obteniendo candidatos');
      let rawCandidates = result.candidates as RawDownloadCandidate[];
      let finalCandidates = resolveDownloadCandidates(
        track,
        rawCandidates,
        { editionPreference: options.editionPreference ?? 'catalog' },
      );
      if ((expanded || options.depth === 'deep') && !finalCandidates.some((candidate) => candidate.verification === 'verified')) {
        const fallback = await api.get_candidates({
          title: getPreferredTrackTitle(track), artist: track.artist, album: getPreferredAlbumName(track),
          duration: track.duration ?? 0, isrc: track.isrc || '', queries,
          animeSearchEnabled, source: 'youtube', depth: 'deep',
        });
        if (fallback.success) rawCandidates = [...rawCandidates, ...(fallback.candidates as RawDownloadCandidate[])];
        finalCandidates = resolveDownloadCandidates(track, rawCandidates, {
          editionPreference: options.editionPreference ?? 'catalog',
        });
      }
      setCachedValue(candidateCache, cacheKey, finalCandidates, finalCandidates.length > 0 ? CANDIDATE_CACHE_TTL_MS : EMPTY_CANDIDATE_CACHE_TTL_MS, CANDIDATE_CACHE_MAX_ENTRIES);
      setPersistentCandidateCacheValue(cacheKey, finalCandidates);
      return finalCandidates;
    } catch (err) {
      console.error('[getDownloadCandidates] PyWebView error:', err);
      throw err;
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { searchYouTubeNative } = await import('@/lib/ytdlpBridge');
      const queries = buildAndroidCandidateQueries(track, animeSearchEnabled);
      const primaryResults = await withTimeout(
        searchYouTubeNative(queries[0], getAndroidPrimaryCandidateLimit(options), {
          source: 'youtube_music',
          enrich: expanded || options.depth === 'deep',
        }),
        20000,
      ).catch(() => []);
      let rawCandidates: RawDownloadCandidate[] = primaryResults;
      let finalCandidates = resolveDownloadCandidates(track, rawCandidates, {
        editionPreference: options.editionPreference ?? 'catalog',
      });
      if ((expanded || options.depth === 'deep') && !finalCandidates.some((candidate) => candidate.verification === 'verified')) {
        const fallbackResults = await withTimeout(
          searchYouTubeNative(queries[1] ?? queries[0], ANDROID_EXTRA_CANDIDATE_LIMIT, {
            source: 'youtube', enrich: true,
          }),
          25000,
        ).catch(() => []);
        rawCandidates = [...rawCandidates, ...fallbackResults];
        finalCandidates = resolveDownloadCandidates(track, rawCandidates, {
          editionPreference: options.editionPreference ?? 'catalog',
        });
      }
      setCachedValue(candidateCache, cacheKey, finalCandidates, finalCandidates.length > 0 ? CANDIDATE_CACHE_TTL_MS : EMPTY_CANDIDATE_CACHE_TTL_MS, CANDIDATE_CACHE_MAX_ENTRIES);
      setPersistentCandidateCacheValue(cacheKey, finalCandidates);
      return finalCandidates;
    } catch (err) {
      console.error('[getDownloadCandidates] Native error:', err);
      throw err;
    }
  }

  // Web/PWA no forma parte del producto activo.
  return [];
}

export async function getDownloadCandidates(
  track: Track,
  animeSearchEnabled = false,
  options: CandidateSearchOptions = {},
): Promise<DownloadCandidate[]> {
  try {
    const cacheKey = buildCandidateCacheKey(track, animeSearchEnabled, false, options);
    const cached = getCachedValue(candidateCache, cacheKey);
    if (cached) return cached;
    const persistentCached = getPersistentCandidateCacheValue(cacheKey);
    if (persistentCached) {
      setCachedValue(candidateCache, cacheKey, persistentCached, CANDIDATE_CACHE_TTL_MS, CANDIDATE_CACHE_MAX_ENTRIES);
      return persistentCached;
    }

    const pending = candidateRequests.get(cacheKey);
    if (pending) return pending;

    const request = fetchDownloadCandidates(track, animeSearchEnabled, false, options).finally(() => {
      candidateRequests.delete(cacheKey);
    });
    candidateRequests.set(cacheKey, request);
    return await request;
  } catch (error) {
    console.error('[getDownloadCandidates] Error:', error);
    throw error;
  }
}

export async function getExpandedDownloadCandidates(
  track: Track,
  animeSearchEnabled = false,
  options: CandidateSearchOptions = {},
): Promise<DownloadCandidate[]> {
  try {
    const cacheKey = buildCandidateCacheKey(track, animeSearchEnabled, true, options);
    const cached = getCachedValue(candidateCache, cacheKey);
    if (cached) return cached;
    const persistentCached = getPersistentCandidateCacheValue(cacheKey);
    if (persistentCached) {
      setCachedValue(candidateCache, cacheKey, persistentCached, CANDIDATE_CACHE_TTL_MS, CANDIDATE_CACHE_MAX_ENTRIES);
      return persistentCached;
    }

    const pending = candidateRequests.get(cacheKey);
    if (pending) return pending;

    const request = fetchDownloadCandidates(track, animeSearchEnabled, true, options).finally(() => {
      candidateRequests.delete(cacheKey);
    });
    candidateRequests.set(cacheKey, request);
    return await request;
  } catch (error) {
    console.error('[getExpandedDownloadCandidates] Error:', error);
    throw error;
  }
}

export async function prefetchDownloadCandidates(
  track: Track,
  animeSearchEnabled = false,
  options: CandidateSearchOptions = {},
): Promise<DownloadCandidate[] | null> {
  const cacheKey = buildCandidateCacheKey(track, animeSearchEnabled, false, options);
  const cached = getCachedValue(candidateCache, cacheKey) ?? getPersistentCandidateCacheValue(cacheKey);
  if (cached) return cached;
  if (candidatePrefetchRequests.has(cacheKey) || activeCandidatePrefetches >= 1) return null;

  candidatePrefetchRequests.add(cacheKey);
  activeCandidatePrefetches++;
  try {
    return await getDownloadCandidates(track, animeSearchEnabled, options);
  } catch {
    return null;
  } finally {
    activeCandidatePrefetches = Math.max(0, activeCandidatePrefetches - 1);
    candidatePrefetchRequests.delete(cacheKey);
  }
}

export function invalidateDownloadCandidateCache(track: Track): void {
  const identity = String(track.isrc || track.deezerId || track.id);
  for (const key of candidateCache.keys()) {
    if (key.includes(`|${identity}|`)) candidateCache.delete(key);
  }
  const entries = readPersistentCandidateCache();
  let changed = false;
  for (const key of Object.keys(entries)) {
    if (key.includes(`|${identity}|`)) {
      delete entries[key];
      changed = true;
    }
  }
  if (changed) writePersistentCandidateCache(entries);
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
  videoIdOverride?: string,
  sourceUrlOverride?: string,
): Promise<ArrayBuffer> {
  if (isRunningInPyWebView()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).pywebview.api;
    if (!videoIdOverride && !sourceUrlOverride) {
      throw new DownloadFailure('candidate_invalid', 'La descarga requiere un candidato resuelto');
    }
    onProgress?.(10);
    const result = await api.get_raw_audio(
      videoIdOverride ?? null,
      getPreferredTrackTitle(track),
      track.artist,
      [],
      sourceUrlOverride ?? null,
      track.duration ?? 0,
    );
    if (!result.success) throw new Error(result.error || 'Error descargando audio');
    onProgress?.(85);
    onProgress?.(95);
    return decodeBase64ArrayBuffer(result.data_b64 as string);
  }

  if (Capacitor.isNativePlatform()) {
    const { downloadMp3Native } = await import('@/lib/ytdlpBridge');

    if (sourceUrlOverride) {
      onProgress?.(10);
      try {
        return await downloadMp3Native(null, {
          sourceUrl: sourceUrlOverride,
          expectedDuration: track.duration,
        });
      } catch {
        // La fuente curada puede estar temporalmente caída; usar YouTube como respaldo.
      }
    }

    if (!videoIdOverride) {
      throw new DownloadFailure('candidate_invalid', 'La descarga requiere un candidato resuelto');
    }
    onProgress?.(10);
    try {
      return await downloadMp3Native(videoIdOverride, { expectedDuration: track.duration });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo descargar';
      if (/403|forbidden|rate.?limit/i.test(message)) throw new DownloadFailure('rate_limit', message);
      throw new DownloadFailure('extraction', message);
    }
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
      format: 'mp3',
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
  const p = prefs ?? {
    lyricOriginal: true,
    lyricRomanization: true,
    lyricTranslation: true,
    lyricLatinOnly: false,
    deviceLang: 'es',
  }

  if (!p.lyricOriginal && !p.lyricRomanization && !p.lyricTranslation && !p.lyricLatinOnly) {
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
    const result = await _combineLyrics(letras, lrclib, p)
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

interface TimedLyricLine {
  timestamp: string
  text: string
}

function parseTimedLyricLines(syncedLrc: string): TimedLyricLine[] {
  return syncedLrc
    .split('\n')
    .map((line) => {
      const match = /^\[(\d+:\d+\.\d+)\](.*)$/.exec(line)
      return match ? { timestamp: match[1], text: match[2].trim() } : null
    })
    .filter((line): line is TimedLyricLine => Boolean(line?.timestamp && line.text))
}

function alignLetrasTimestamps(
  originalLines: string[],
  syncedLrc: string,
  areEquivalent: (left: string, right: string) => boolean,
): Array<string | undefined> | null {
  const timedLines = parseTimedLyricLines(syncedLrc)
  if (!timedLines.length) return null

  let nextTimedIndex = 0
  const aligned: Array<string | undefined> = []
  for (const line of originalLines) {
    const relativeIndex = timedLines
      .slice(nextTimedIndex)
      .findIndex((timedLine) => areEquivalent(timedLine.text, line))
    if (relativeIndex < 0) return null
    const matchIndex = nextTimedIndex + relativeIndex
    aligned.push(timedLines[matchIndex].timestamp)
    nextTimedIndex = matchIndex + 1
  }
  return aligned
}

async function _combineLyrics(
  letras: LetrasResult,
  lrclib: LrclibResult | null,
  p: LyricPrefs,
): Promise<{ synced: string | null; plain: string | null } | null> {
  if (letras.original.length === 0) return null

  const result: string[] = []
  const sample = letras.original.join('\n').slice(0, 500)
  const {
    detectScript,
    detectLyricSourceLanguage,
    areLyricLinesEquivalent,
    processLyrics,
    romanizeLines,
    shouldTranslateLyrics,
    translateLines,
  } = await import('@/lib/lyricsProcessor')
  const sourceScript = detectScript(sample)
  const sourceLang = detectLyricSourceLanguage(sample, sourceScript)
  const timestamps = lrclib?.syncedLrc
    ? alignLetrasTimestamps(letras.original, lrclib.syncedLrc, areLyricLinesEquivalent)
    : null
  if (lrclib?.syncedLrc && !timestamps) {
    return processLyrics(lrclib.syncedLrc, lrclib.plainLrc, p)
  }
  const shouldTranslate = shouldTranslateLyrics(sourceLang, p.deviceLang, p.lyricTranslation)
  const hasAlignedTranslation = (
    letras.translated.length === letras.original.length
    && letras.translated.some((line) => line.trim())
  )
  const needsGeneratedTranslation = (
    shouldTranslate
    && (
      p.deviceLang !== 'es'
      || !hasAlignedTranslation
      || letras.translated.some((line) => !line.trim())
    )
  )
  const generatedTranslation = needsGeneratedTranslation
    ? await translateLines(letras.original, p.deviceLang)
    : null
  const translated = shouldTranslate
    ? p.deviceLang === 'es' && hasAlignedTranslation
      ? letras.translated.map((line, index) => line.trim() || generatedTranslation?.[index] || '')
      : generatedTranslation
    : null
  const needsRomanization = (
    (p.lyricRomanization || p.lyricLatinOnly)
    && sourceScript !== 'latin'
  )
  const hasAlignedRomanization = (
    letras.romaji.length === letras.original.length
    && letras.romaji.some((line) => line.trim())
  )
  const needsGeneratedRomanization = (
    needsRomanization
    && (
      !hasAlignedRomanization
      || letras.romaji.some((line) => !line.trim())
    )
  )
  const generatedRomanization = needsGeneratedRomanization
    ? await romanizeLines(letras.original, sourceScript)
    : []
  const romaji = needsRomanization
    ? hasAlignedRomanization
      ? letras.romaji.map((line, index) => line.trim() || generatedRomanization[index] || '')
      : generatedRomanization
    : []
  const plainResult: string[] = []

  for (let i = 0; i < letras.original.length; i++) {
    const ts = timestamps?.[i]

    const selectedLines: string[] = []
    const pushDistinct = (line: string | undefined) => {
      if (
        !line?.trim() ||
        selectedLines.some((selected) => areLyricLinesEquivalent(selected, line))
      ) {
        return
      }
      selectedLines.push(line)
      plainResult.push(line)
    }

    if (p.lyricLatinOnly) {
      pushDistinct(romaji[i] || letras.original[i])
    } else {
      if (p.lyricOriginal) pushDistinct(letras.original[i])
      if (p.lyricRomanization) pushDistinct(romaji[i])
    }
    if (shouldTranslate) pushDistinct(translated?.[i])
    if (ts) result.push(`[${ts}]${selectedLines.join('  •  ')}`)
  }

  return {
    synced: timestamps ? result.join('\n') || null : null,
    plain: plainResult.join('\n') || null,
  }
}

export const __testing = {
  combineLyrics: _combineLyrics,
  buildCandidateQueries,
  buildAndroidCandidateQueries,
  getAndroidPrimaryCandidateLimit,
  buildCandidateCacheKey,
  rankDownloadCandidates,
  shouldExpandCandidateSearch,
  getCacheSizes: () => ({
    searches: searchCache.size,
    candidates: candidateCache.size,
  }),
  clearRequestCaches: () => {
    searchCache.clear();
    searchRequests.clear();
    candidateCache.clear();
    candidateRequests.clear();
    candidatePrefetchRequests.clear();
    activeCandidatePrefetches = 0;
  },
}
