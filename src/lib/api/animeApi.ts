import { Track } from '@/types/music';
import type { Anime, AnimeTheme } from '@/types/anime';
import { getDownloadCandidates } from '@/lib/api/musicApi';
import { requirePyWebViewApi, getRailwayUrl, railwayHeaders } from '@/lib/api/musicApi';

export interface AnimeSearchResponse {
  success: boolean;
  results?: Anime[];
  error?: string;
}

export interface AnimeThemesResponse {
  success: boolean;
  themes?: AnimeTheme[];
  error?: string;
}

export interface DownloadAnimeThemeResponse {
  success: boolean;
  candidates?: ReturnType<typeof getDownloadCandidates> extends Promise<infer T> ? T : never;
  track?: Track;
  sourceUrl?: string;
  error?: string;
}

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

const ANIME_CACHE_TTL_MS = 5 * 60 * 1000;
const ANIME_CACHE_MAX_ENTRIES = 50;

const searchCache = new Map<string, TimedCacheEntry<Anime[]>>();
const searchRequests = new Map<string, Promise<AnimeSearchResponse>>();
const themesCache = new Map<string, TimedCacheEntry<AnimeTheme[]>>();
const themesRequests = new Map<string, Promise<AnimeThemesResponse>>();
const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANIMETHEMES_ENDPOINT = 'https://api.animethemes.moe';

const ANILIST_SEARCH_QUERY = `
query ($search: String!, $perPage: Int!) {
  Page(perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      coverImage { extraLarge large }
      format
      episodes
      startDate { year }
      description
    }
  }
}`;

const ANILIST_BY_ID_QUERY = `
query ($id: Int!) {
  Media(id: $id, type: ANIME) {
    title { romaji english native }
  }
}`;

function normalizeAnimeSearchQuery(query: string): string {
  return query
    .replace(/\b(anime|theme song|ost)\b/gi, ' ')
    .replace(/\b(opening|ending|op|ed)\s*\d*\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || query.trim();
}

function stripHtml(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

function animeType(value: unknown): Anime['type'] {
  return value === 'TV' || value === 'MOVIE' || value === 'OVA' || value === 'SPECIAL'
    ? value
    : 'SPECIAL';
}

function parseAnimeList(value: unknown): Anime[] {
  if (!value || typeof value !== 'object') return [];
  const page = (value as { data?: { Page?: { media?: unknown } } }).data?.Page;
  if (!Array.isArray(page?.media)) return [];
  return page.media.flatMap((item): Anime[] => {
    if (!item || typeof item !== 'object') return [];
    const media = item as {
      id?: unknown;
      title?: { romaji?: unknown; english?: unknown; native?: unknown };
      coverImage?: { extraLarge?: unknown; large?: unknown };
      format?: unknown;
      type?: unknown;
      episodes?: unknown;
      startDate?: { year?: unknown };
      description?: unknown;
    };
    const id = typeof media.id === 'number' ? media.id : 0;
    const romaji = typeof media.title?.romaji === 'string'
      ? media.title.romaji
      : typeof media.title?.english === 'string'
        ? media.title.english
        : '';
    if (!id || !romaji) return [];
    return [{
      id,
      titleRomaji: romaji,
      titleEnglish: typeof media.title?.english === 'string' ? media.title.english : null,
      titleNative: typeof media.title?.native === 'string' ? media.title.native : null,
      cover: typeof media.coverImage?.extraLarge === 'string'
        ? media.coverImage.extraLarge
        : typeof media.coverImage?.large === 'string'
          ? media.coverImage.large
          : '',
      type: animeType(media.format ?? media.type),
      episodes: typeof media.episodes === 'number' ? media.episodes : null,
      year: typeof media.startDate?.year === 'number' ? media.startDate.year : null,
      synopsis: stripHtml(media.description),
    }];
  });
}

async function postAniList(query: string, variables: Record<string, string | number>): Promise<unknown> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const payload = await response.json() as { errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'AniList error');
  return payload;
}

function parseEpisodeRange(value: unknown): [number | null, number | null] {
  if (typeof value !== 'string') return [null, null];
  const numbers = value.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (!numbers.length) return [null, null];
  return [Math.min(...numbers), Math.max(...numbers)];
}

function parseAnimeThemes(payload: unknown, anilistId: number): AnimeTheme[] {
  if (!payload || typeof payload !== 'object') return [];
  const anime = (payload as { anime?: { animethemes?: unknown } }).anime;
  if (!Array.isArray(anime?.animethemes)) return [];
  const results: AnimeTheme[] = [];
  for (const rawTheme of anime.animethemes) {
    if (!rawTheme || typeof rawTheme !== 'object') continue;
    const theme = rawTheme as {
      type?: unknown;
      sequence?: unknown;
      song?: { title?: unknown; artists?: unknown };
      animethemeentries?: unknown;
    };
    if (theme.type !== 'OP' && theme.type !== 'ED') continue;
    const sequence = typeof theme.sequence === 'number' ? theme.sequence : 0;
    const entries = Array.isArray(theme.animethemeentries) ? theme.animethemeentries : [];
    const artists = Array.isArray(theme.song?.artists)
      ? theme.song.artists
          .map((artist) => (
            artist && typeof artist === 'object' && typeof (artist as { name?: unknown }).name === 'string'
              ? (artist as { name: string }).name
              : ''
          ))
          .filter(Boolean)
      : [];
    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as { episodes?: unknown; videos?: unknown };
      const videos = Array.isArray(entry.videos) ? entry.videos : [];
      const video = videos.find((candidate) => candidate && typeof candidate === 'object') as
        | { link?: unknown; audio?: { link?: unknown } }
        | undefined;
      const audioUrl = typeof video?.audio?.link === 'string' ? video.audio.link : null;
      const videoUrl = typeof video?.link === 'string' ? video.link : null;
      if (!audioUrl) continue;
      const [episodesFrom, episodesTo] = parseEpisodeRange(entry.episodes);
      results.push({
        animeId: anilistId,
        type: theme.type,
        sequence,
        title: typeof theme.song?.title === 'string'
          ? theme.song.title
          : `${theme.type} ${sequence}`,
        artist: artists.join(', '),
        episodesFrom,
        episodesTo,
        audioUrl,
        videoUrl,
      });
      break;
    }
  }
  return results;
}

async function getAnimeThemesDirect(anilistId: number): Promise<AnimeTheme[]> {
  const metaPayload = await postAniList(ANILIST_BY_ID_QUERY, { id: anilistId });
  const title = (metaPayload as {
    data?: { Media?: { title?: { english?: unknown; romaji?: unknown } } };
  }).data?.Media?.title;
  const name = typeof title?.english === 'string'
    ? title.english
    : typeof title?.romaji === 'string'
      ? title.romaji
      : '';
  if (!name) return [];

  const searchUrl = new URL(`${ANIMETHEMES_ENDPOINT}/anime`);
  searchUrl.searchParams.set('filter[name]', name);
  searchUrl.searchParams.set('page[size]', '15');
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) throw new Error(`AnimeThemes HTTP ${searchResponse.status}`);
  const searchPayload = await searchResponse.json() as {
    anime?: Array<{ name?: string; slug?: string }>;
  };
  const normalized = name.replace(/\W+/g, '').toLocaleLowerCase();
  const match = searchPayload.anime?.find(
    (item) => item.name?.replace(/\W+/g, '').toLocaleLowerCase() === normalized,
  ) ?? searchPayload.anime?.[0];
  if (!match?.slug) return [];

  const themesUrl = new URL(`${ANIMETHEMES_ENDPOINT}/anime/${encodeURIComponent(match.slug)}`);
  themesUrl.searchParams.set(
    'include',
    'animethemes.song.artists,animethemes.animethemeentries.videos.audio',
  );
  const themesResponse = await fetch(themesUrl);
  if (!themesResponse.ok) throw new Error(`AnimeThemes HTTP ${themesResponse.status}`);
  return parseAnimeThemes(await themesResponse.json(), anilistId);
}

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

function isAndroidPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor inyecta `window.androidBridge` en la app nativa Android.
  // No usamos `Capacitor.isNativePlatform()` porque su `win` queda capturado
  // al cargar el módulo y nunca refleja cambios en jsdom.
  if ('androidBridge' in window) return true;
  const w = window as Window & { webkit?: { messageHandlers?: { bridge?: unknown } } };
  if (w.webkit?.messageHandlers?.bridge) return true;
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

function isPyWebViewPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('platform') === 'pywebview') return true;
  return 'pywebview' in window;
}

export const __animeApiTesting = {
  clearCaches: () => {
    searchCache.clear();
    searchRequests.clear();
    themesCache.clear();
    themesRequests.clear();
  },
  getCacheSizes: () => ({
    searches: searchCache.size,
    themes: themesCache.size,
  }),
};

export async function searchAnime(
  query: string,
  limit = 10,
): Promise<AnimeSearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { success: false, error: 'Empty query' };
  }

  const cacheKey = `${normalizedQuery.toLowerCase()}|${limit}`;
  const cached = getCachedValue(searchCache, cacheKey);
  if (cached) return { success: true, results: cached };

  const pending = searchRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<AnimeSearchResponse> => {
    try {
      let results: Anime[];

      if (isPyWebViewPlatform()) {
        const api = requirePyWebViewApi();
        const data = await api.anime_search?.(normalizeAnimeSearchQuery(normalizedQuery), limit);
        if (!data) throw new Error('anime_search unavailable in desktop bridge');
        if (!data.success) {
          return { success: false, error: data.error || 'Desktop anime search failed' };
        }
        results = data.results || [];
      } else if (isAndroidPlatform()) {
        const payload = await postAniList(ANILIST_SEARCH_QUERY, {
          search: normalizeAnimeSearchQuery(normalizedQuery),
          perPage: Math.max(1, Math.min(limit, 25)),
        });
        results = parseAnimeList(payload);
      } else {
        const url = `${getRailwayUrl()}/anime/search`;
        const res = await fetch(url, {
          method: 'POST',
          headers: railwayHeaders(),
          body: JSON.stringify({ query: normalizedQuery, limit }),
        });
        const text = await res.text();
        if (!res.ok) {
          let err: { error?: string; detail?: string } | null = null;
          try { err = JSON.parse(text); } catch { /* ignore */ }
          const statusText = res.status === 401 ? 'Unauthorized' : (err?.error || err?.detail || `HTTP ${res.status}`);
          return { success: false, error: statusText };
        }
        const data = JSON.parse(text) as { results?: Anime[]; error?: string };
        if (data.error) {
          return { success: false, error: data.error };
        }
        results = data.results || [];
      }

      setCachedValue(searchCache, cacheKey, results, ANIME_CACHE_TTL_MS, ANIME_CACHE_MAX_ENTRIES);
      return { success: true, results };
    } catch (error) {
      if (error instanceof Error && error.name === 'DesktopBridgeUnavailableError') {
        return { success: false, error: 'Desktop bridge unavailable' };
      }
      const message = error instanceof Error ? error.message : 'Unknown anime search error';
      return { success: false, error: message };
    } finally {
      searchRequests.delete(cacheKey);
    }
  })();

  searchRequests.set(cacheKey, request);
  return request;
}

export async function getAnimeThemes(
  anilistId: number,
): Promise<AnimeThemesResponse> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    return { success: false, error: 'Invalid anilistId' };
  }

  const cacheKey = String(anilistId);
  const cached = getCachedValue(themesCache, cacheKey);
  if (cached) return { success: true, themes: cached };

  const pending = themesRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<AnimeThemesResponse> => {
    try {
      let themes: AnimeTheme[];

      if (isPyWebViewPlatform()) {
        const api = requirePyWebViewApi();
        const data = await api.anime_get_themes?.(anilistId);
        if (!data) throw new Error('anime_get_themes unavailable in desktop bridge');
        if (!data.success) {
          return { success: false, error: data.error || 'Desktop themes fetch failed' };
        }
        themes = data.themes || [];
      } else if (isAndroidPlatform()) {
        themes = await getAnimeThemesDirect(anilistId);
      } else {
        const url = `${getRailwayUrl()}/anime/themes`;
        const res = await fetch(url, {
          method: 'POST',
          headers: railwayHeaders(),
          body: JSON.stringify({ anilistId }),
        });
        const text = await res.text();
        if (!res.ok) {
          let err: { error?: string; detail?: string } | null = null;
          try { err = JSON.parse(text); } catch { /* ignore */ }
          const statusText = res.status === 401 ? 'Unauthorized' : (err?.error || err?.detail || `HTTP ${res.status}`);
          return { success: false, error: statusText };
        }
        const data = JSON.parse(text) as { themes?: AnimeTheme[]; error?: string };
        if (data.error) {
          return { success: false, error: data.error };
        }
        themes = data.themes || [];
      }

      setCachedValue(themesCache, cacheKey, themes, ANIME_CACHE_TTL_MS, ANIME_CACHE_MAX_ENTRIES);
      return { success: true, themes };
    } catch (error) {
      if (error instanceof Error && error.name === 'DesktopBridgeUnavailableError') {
        return { success: false, error: 'Desktop bridge unavailable' };
      }
      const message = error instanceof Error ? error.message : 'Unknown themes fetch error';
      return { success: false, error: message };
    } finally {
      themesRequests.delete(cacheKey);
    }
  })();

  themesRequests.set(cacheKey, request);
  return request;
}

export async function downloadAnimeTheme(
  theme: AnimeTheme,
  animeTitle: string,
): Promise<DownloadAnimeThemeResponse> {
  const virtualTrack: Track = {
    id: `anime-${theme.animeId}-${theme.type}-${theme.sequence}`,
    title: `${animeTitle} ${theme.type} ${theme.sequence}`,
    artist: theme.artist,
    album: animeTitle,
    duration: 0,
    cover: '',
  };

  try {
    if (theme.audioUrl) {
      return { success: true, sourceUrl: theme.audioUrl, track: virtualTrack };
    }
    const candidates = await getDownloadCandidates(virtualTrack, true);
    return {
      success: false,
      error: 'CURATED_AUDIO_UNAVAILABLE',
      candidates,
      track: virtualTrack,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    return { success: false, error: message };
  }
}
