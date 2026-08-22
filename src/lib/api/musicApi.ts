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
}

interface PyWebViewWindow extends Window {
  pywebview?: {
    api?: PyWebViewApi
  }
}

interface RawDeezerContributor {
  id?: number | string;
  name?: string;
  role?: string;
}

interface RawDeezerTrack {
  id?: string | number;
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: {
    id?: string | number;
    title?: string;
    cover_big?: string;
    cover_medium?: string;
    cover_small?: string;
    track_total?: number;
    nb_tracks?: number;
    artist?: { name?: string };
  };
  contributors?: RawDeezerContributor[];
  duration?: number;
  preview?: string;
  isrc?: string;
  explicit_lyrics?: boolean;
  release_date?: string;
  track_position?: number;
  disk_number?: number;
}

interface RawDeezerAlbum {
  id?: string | number;
  title?: string;
  genres?: { data?: Array<{ name?: string }> };
  artist?: { name?: string };
  nb_tracks?: number;
  release_date?: string;
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

// ─── Helpers para Desktop Python ───────────────────────────────────────────────────────

// ─── Llamada directa a Deezer: pywebview (bridge Python) o fetch directo ───
async function callDeezerDirect<T = unknown>(path: string): Promise<T> {
  if (isRunningInPyWebView()) {
    // Usar el bridge Python — evita CORS en el webview
    const pyapi = (window as PyWebViewWindow).pywebview?.api;
    if (pyapi) {
      const url = new URL(path, 'https://api.deezer.com');
      const segments = url.pathname.split('/').filter(Boolean);
      // Rutas simples: /search, /track/{id}, /album/{id}
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
    title: typeof t.title === 'string' ? t.title : 'Unknown',
    canonicalTitle: typeof t.title_short === 'string' ? t.title_short : (typeof t.title === 'string' ? t.title : 'Unknown'),
    artist: typeof artist.name === 'string' ? artist.name : 'Unknown',
    album: typeof album.title === 'string' ? album.title : 'Unknown',
    canonicalAlbum: typeof album.title === 'string' ? album.title : 'Unknown',
    duration: t.duration || 0,
    cover: typeof album.cover_big === 'string' ? album.cover_big : (typeof album.cover_medium === 'string' ? album.cover_medium : (typeof album.cover_small === 'string' ? album.cover_small : '')),
    preview: t.preview || '',
    isrc: t.isrc || '',
    edition: t.explicit_lyrics === true ? 'explicit' : t.explicit_lyrics === false ? 'clean' : 'unknown',
  };
}

interface RawITunesTrack {
  trackId?: number | string;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  previewUrl?: string;
  trackExplicitness?: string;
}

// ─── iTunes Fallback ───
async function searchITunes(query: string, limit = 25): Promise<Track[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results || []) as RawITunesTrack[]).map((t): Track => ({
      id: `itunes_${t.trackId}`,
      title: t.trackName || 'Unknown Title',
      canonicalTitle: t.trackName || 'Unknown Title',
      artist: t.artistName || 'Unknown Artist',
      album: t.collectionName || 'Unknown Album',
      canonicalAlbum: t.collectionName || 'Unknown Album',
      duration: Math.floor((t.trackTimeMillis || 0) / 1000),
      cover: (t.artworkUrl100 || '').replace('100x100bb', '1000x1000bb'),
      preview: t.previewUrl || '',
      isrc: '',
      edition: t.trackExplicitness === 'explicit' ? 'explicit' : t.trackExplicitness === 'cleaned' ? 'clean' : 'unknown',
    }));
  } catch (error) {
    console.error('iTunes fallback error:', error);
    return [];
  }
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
      const data = await callDeezerDirect<{ data?: RawDeezerTrack[] }>(
        `/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}&index=${offset}`,
      );
      let tracks = (data.data || []).map(mapRawDeezerTrack);
      
      // Fallback a iTunes si Deezer está caído o no encuentra nada
      if (tracks.length === 0) {
        console.log('[Search] Fallback to iTunes API');
        if (typeof window !== 'undefined') {
          import('sonner').then(({ toast }) => {
            toast.info('Buscando en catálogo de respaldo...', { id: 'itunes-fallback' });
          });
        }
        tracks = await searchITunes(normalizedQuery, limit);
      }
      
      setCachedValue(searchCache, cacheKey, tracks, SEARCH_CACHE_TTL_MS, SEARCH_CACHE_MAX_ENTRIES);
      return tracks;
    } catch (error) {
      console.error('Deezer search error:', error);
      console.log('[Search] Fallback to iTunes API on error');
      if (typeof window !== 'undefined') {
        import('sonner').then(({ toast }) => {
          toast.info('Conexión inestable, usando catálogo de respaldo...', { id: 'itunes-fallback' });
        });
      }
      const tracks = await searchITunes(normalizedQuery, limit);
      return tracks;
    } finally {
      searchRequests.delete(cacheKey);
    }
  })();

  searchRequests.set(cacheKey, request);
  return request;
}

export interface TrackMetadataDetails {
  albumArtist: string | null;
  composer: string | null;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  trackTotal: number | null;
  discNumber: number | null;
  discTotal: number | null;
}

// ─── Full metadata for a track (album artist, composer, genre, year, track number/total, disc number/total) ───
export async function getDeezerTrackMeta(
  trackId: string | number,
  fallbackTrack?: Track
): Promise<TrackMetadataDetails> {
  const idStr = String(trackId).trim();

  // Caso 1: iTunes ID
  if (idStr.startsWith('itunes_')) {
    try {
      const realId = idStr.split('_')[1];
      const res = await fetch(`https://itunes.apple.com/lookup?id=${realId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const t = data.results?.[0];
      if (!t) throw new Error();
      return {
        albumArtist: t.collectionArtistName || t.artistName || fallbackTrack?.artist || null,
        composer: t.composerName || null,
        genre: t.primaryGenreName || null,
        year: t.releaseDate ? parseInt(t.releaseDate.substring(0, 4), 10) : null,
        trackNumber: t.trackNumber || null,
        trackTotal: t.trackCount || null,
        discNumber: t.discNumber || 1,
        discTotal: t.discCount || 1,
      };
    } catch {
      return {
        albumArtist: fallbackTrack?.artist || null,
        composer: null,
        genre: null,
        year: null,
        trackNumber: null,
        trackTotal: null,
        discNumber: 1,
        discTotal: 1,
      };
    }
  }

  // Caso 2: Deezer track numeric ID o dz-ID
  const numericId = idStr.replace(/^dz-/, '');
  if (/^\d+$/.test(numericId)) {
    try {
      const track = await callDeezerDirect<RawDeezerTrack>(`/track/${numericId}`);
      const releaseDate: string | undefined = track.release_date;
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
      let genre: string | null = null;
      let albumArtist: string | null = track.album?.artist?.name || track.artist?.name || fallbackTrack?.artist || null;
      let trackTotal: number | null = track.album?.track_total || track.album?.nb_tracks || null;

      if (track.album?.id) {
        try {
          const album = await callDeezerDirect<RawDeezerAlbum>(`/album/${track.album.id}`);
          genre = album.genres?.data?.[0]?.name ?? null;
          if (!albumArtist && album.artist?.name) {
            albumArtist = album.artist.name;
          }
          if (!trackTotal && album.nb_tracks) {
            trackTotal = album.nb_tracks;
          }
        } catch { /* ignore non-critical */ }
      }

      let composer: string | null = null;
      if (Array.isArray(track.contributors) && track.contributors.length > 0) {
        const composers = track.contributors
          .filter((c) => {
            const role = (c.role || '').toLowerCase();
            return role.includes('composer') || role.includes('author') || role.includes('music') || role.includes('writer');
          })
          .map((c) => c.name)
          .filter(Boolean);
        if (composers.length > 0) {
          composer = Array.from(new Set(composers)).join(', ');
        }
      }

      return {
        albumArtist: albumArtist || fallbackTrack?.artist || null,
        composer,
        genre,
        year,
        trackNumber: track.track_position ?? null,
        trackTotal,
        discNumber: track.disk_number ?? 1,
        discTotal: 1,
      };
    } catch {
      // Deezer directo falló
    }
  }

  // Caso 3: Fallback si no hay ID numérico o falló
  return {
    albumArtist: fallbackTrack?.artist || null,
    composer: null,
    genre: null,
    year: null,
    trackNumber: null,
    trackTotal: null,
    discNumber: 1,
    discTotal: 1,
  };
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
  return typeof localStorage !== 'undefined';
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

// ─── Download track audio ───
// Android: yt-dlp local (via YtDlpPlugin nativo)
// Desktop Python: yt-dlp.exe local (via pywebview)
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

  throw new DownloadFailure('candidate_invalid', 'Plataforma no compatible');
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
  getCacheSizes: () => ({
    searches: searchCache.size,
    candidates: candidateCache.size,
  }),
  clearRequestCaches: () => {
    searchCache.clear();
    searchRequests.clear();
    candidateCache.clear();
    candidateRequests.clear();
  },
}
