import { Track } from '@/types/music';
import type { Anime, AnimeTheme } from '@/types/anime';
import { useMusicStore } from '@/store/musicStore';
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
  videoId?: string;
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
        const data = await api.anime_search?.(normalizedQuery, limit);
        if (!data) throw new Error('anime_search unavailable in desktop bridge');
        if (!data.success) {
          return { success: false, error: data.error || 'Desktop anime search failed' };
        }
        results = data.results || [];
      } else if (isAndroidPlatform()) {
        return {
          success: false,
          error: 'UNSUPPORTED_PLATFORM',
        };
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
        return {
          success: false,
          error: 'UNSUPPORTED_PLATFORM',
        };
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
    youtubeId: theme.videoId,
  };

  try {
    useMusicStore.getState().startDownloadWithVideoId(virtualTrack, theme.videoId);
    return { success: true, videoId: theme.videoId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    if (!/dead|unavailable|forbidden|not found|404|410/i.test(message)) {
      return { success: false, error: message };
    }
    try {
      const candidates = await getDownloadCandidates(virtualTrack);
      return { success: false, error: message, candidates };
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Fallback failed';
      return { success: false, error: `${message}; ${fallbackMessage}` };
    }
  }
}
