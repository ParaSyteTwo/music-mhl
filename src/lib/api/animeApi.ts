import { Track } from '@/types/music';
import type { Anime, AnimeSeason, AnimeTheme } from '@/types/anime';
import {
  getDownloadCandidates,
  requirePyWebViewApi,
  searchDeezer,
  type DownloadCandidate,
} from '@/lib/api/musicApi';
import { canDownloadWithOneTap } from '@/lib/download/candidateResolver';

export interface AnimeSearchResponse {
  success: boolean;
  results?: Anime[];
  error?: string;
}

export interface AnimeThemesResponse {
  success: boolean;
  themes?: AnimeTheme[];
  seasons?: AnimeSeason[];
  error?: string;
}

export interface DownloadAnimeThemeResponse {
  success: boolean;
  candidates?: DownloadCandidate[];
  track?: Track;
  videoId?: string;
  sourceUrl?: string;
  error?: string;
}

export interface ParsedJikanTheme {
  type: 'OP' | 'ED';
  sequence: number;
  title: string;
  artist: string;
  episodesFrom: number | null;
  episodesTo: number | null;
}

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CachedAnimeThemesPayload {
  themes: AnimeTheme[];
  seasons?: AnimeSeason[];
}

interface AniListSeasonNode {
  anilistId: number;
  malId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  format: string | null;
  year: number | null;
  episodes: number | null;
  cover: string;
  relations: Array<{
    relationType: 'PREQUEL' | 'SEQUEL';
    node: AniListSeasonNode;
  }>;
}

interface DesktopAnimeThemesPayload {
  success: boolean;
  error?: string;
  themes?: AnimeTheme[];
  seasons?: AnimeSeason[];
}

const ANIME_CACHE_TTL_MS = 5 * 60 * 1000;
const ANIME_CACHE_MAX_ENTRIES = 50;
const NETWORK_TIMEOUT_MS = 8000;
const MAX_SEASON_NODES = 12;
const SEASON_THEME_CONCURRENCY = 2;
const JIKAN_RETRY_DEFAULT_MS = 500;
const JIKAN_RETRY_MAX_MS = 1500;
const SEASON_FORMATS = new Set(['TV', 'ONA']);
const TRAVERSABLE_BRIDGE_FORMATS = new Set(['TV', 'MOVIE', 'OVA', 'ONA', 'TV_SHORT']);

const searchCache = new Map<string, TimedCacheEntry<Anime[]>>();
const searchRequests = new Map<string, Promise<AnimeSearchResponse>>();
const themesCache = new Map<string, TimedCacheEntry<CachedAnimeThemesPayload>>();
const themesRequests = new Map<string, Promise<AnimeThemesResponse>>();

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANISONGDB_ENDPOINT = 'https://anisongdb.com/api/search_request';
const MAL_BASE_URL = 'https://myanimelist.net/anime';
const JIKAN_ENDPOINT = 'https://api.jikan.moe/v4';
const ANIMETHEMES_ENDPOINT = 'https://api.animethemes.moe';
const ANIMETHEMES_INCLUDE = 'animethemes.song.artists,animethemes.animethemeentries.videos.audio';
const MHL_USER_AGENT = 'MHLMusic/1.5.6 (https://github.com/ParaSyteTwo/music-mhl)';

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
    id
    idMal
    title { romaji english native }
    format
    episodes
    startDate { year }
    coverImage { extraLarge large }
    relations {
      edges {
        relationType
        node {
          id
          idMal
          title { romaji english native }
          format
          episodes
          startDate { year }
          coverImage { extraLarge large }
        }
      }
    }
  }
}`;

const UNOFFICIAL_TRACK_PATTERN = /\b(cover|karaoke|instrumental|off\s*vocal|tv\s*size|tv\s*edit|tv\s*ver\.?|8-?bit|piano\s*ver\.?|music\s*box|lullaby|nightcore|slowed|sped\s*up|remix|tribute|parody|acoustic|live|en\s*vivo)\b/i;

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

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = NETWORK_TIMEOUT_MS,
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const requestInit: RequestInit = controller
      ? { ...init, signal: controller.signal }
      : init;
    try {
      return await fetch(input, requestInit);
    } catch (err) {
      if (controller && err instanceof TypeError && /AbortSignal/i.test(err.message)) {
        return await fetch(input, init);
      }
      throw err;
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) return;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
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
  const response = await fetchWithTimeout(ANILIST_ENDPOINT, {
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
  const trimmed = value.trim();
  const numbers = trimmed.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (!numbers.length) return [null, null];
  const isOpenEnded = /[-–—]\s*$/.test(trimmed);
  return [Math.min(...numbers), isOpenEnded ? null : Math.max(...numbers)];
}

function stripNativeParenthetical(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (!match) return trimmed;
  const before = match[1].trim();
  const inside = match[2].trim();
  // Preserve featuring / voice-actor parentheticals even if they include CJK characters
  if (/^(?:feat\.?|ft\.?|featuring|with|cv[:.\s])/i.test(inside)) {
    return trimmed;
  }
  // Remove trailing pure non-Latin (kanji/kana/hangul) duplicate when a Latin title/artist precedes it
  if (before && /[a-zA-Z]/.test(before) && !/[a-zA-Z]/.test(inside) && /[^\x00-\x7F]/.test(inside)) {
    return before;
  }
  return trimmed;
}

export function parseJikanThemeEntry(
  raw: string,
  type: 'OP' | 'ED',
  defaultSeq: number,
): ParsedJikanTheme {
  let text = String(raw ?? '').trim();
  let sequence = defaultSeq;

  const seqMatch = text.match(/^(\d+)\s*:\s*/);
  if (seqMatch) {
    const parsedSeq = Number(seqMatch[1]);
    if (Number.isInteger(parsedSeq) && parsedSeq > 0) {
      sequence = parsedSeq;
    }
    text = text.slice(seqMatch[0].length).trim();
  }

  let episodesFrom: number | null = null;
  let episodesTo: number | null = null;

  // Strip trailing bracket notes like [Broadcast], [TV], [TV Size] before extracting episode range
  text = text.replace(/(?:\s*\[[^\]]+\])+\s*$/, '').trim();

  const epMatch = text.match(/\s*\(\s*(?:episodes?|eps?)\.?\s*([0-9,\-–—\s]+)\s*\)\s*$/i);
  if (epMatch) {
    [episodesFrom, episodesTo] = parseEpisodeRange(epMatch[1]);
    text = text.slice(0, epMatch.index).trim();
  }

  // Strip bracket notes that appeared immediately before (eps ...)
  text = text.replace(/(?:\s*\[[^\]]+\])+\s*$/, '').trim();

  let rawTitle = '';
  let rawArtist = '';

  const quotedByMatch = text.match(/^["“](.+?)["”]\s+by\s+(.+)$/i);
  if (quotedByMatch) {
    rawTitle = quotedByMatch[1].trim();
    rawArtist = quotedByMatch[2].trim();
  } else {
    const quotedOnlyMatch = text.match(/^["“](.+?)["”]\s*(.*)$/);
    if (quotedOnlyMatch) {
      rawTitle = quotedOnlyMatch[1].trim();
      rawArtist = quotedOnlyMatch[2].replace(/^by\s+/i, '').trim();
    } else {
      const plainByMatch = text.match(/^(.+?)\s+by\s+(.+)$/i);
      if (plainByMatch) {
        rawTitle = plainByMatch[1].trim();
        rawArtist = plainByMatch[2].trim();
      } else {
        rawTitle = text;
      }
    }
  }

  // Handle episode tag that might still trail artist (e.g. if followed by another parenthetical)
  if (episodesFrom === null && rawArtist) {
    const trailingArtistEp = rawArtist.match(/\s*\(\s*(?:episodes?|eps?)\.?\s*([0-9,\-–—\s]+)\s*\)\s*/i);
    if (trailingArtistEp) {
      [episodesFrom, episodesTo] = parseEpisodeRange(trailingArtistEp[1]);
      rawArtist = rawArtist.replace(trailingArtistEp[0], ' ').trim();
    }
  }

  rawArtist = rawArtist.replace(/(?:\s*\[[^\]]+\])+\s*$/, '').trim();

  const title = stripNativeParenthetical(rawTitle) || `${type} ${sequence}`;
  const artist = stripNativeParenthetical(
    rawArtist.replace(/\s*\([^)]*(?:episodes?|eps?)\.?\s*\d+[^)]*\)\s*$/i, '').trim(),
  );

  return {
    type,
    sequence,
    title,
    artist,
    episodesFrom,
    episodesTo,
  };
}

function parseAniListSeasonNode(raw: unknown, fallbackId?: number): AniListSeasonNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const media = raw as {
    id?: unknown;
    idMal?: unknown;
    title?: { romaji?: unknown; english?: unknown; native?: unknown };
    format?: unknown;
    episodes?: unknown;
    startDate?: { year?: unknown };
    coverImage?: { extraLarge?: unknown; large?: unknown };
    relations?: { edges?: unknown };
  };

  const anilistId = typeof media.id === 'number' && media.id > 0
    ? media.id
    : (fallbackId ?? 0);
  if (!anilistId) return null;

  const titleEnglish = typeof media.title?.english === 'string' && media.title.english.trim()
    ? media.title.english.trim()
    : null;
  const titleRomaji = typeof media.title?.romaji === 'string' && media.title.romaji.trim()
    ? media.title.romaji.trim()
    : (titleEnglish ?? '');
  if (!titleRomaji) return null;

  const malId = typeof media.idMal === 'number' && media.idMal > 0 ? media.idMal : null;
  const format = typeof media.format === 'string' ? media.format : null;
  const episodes = typeof media.episodes === 'number' ? media.episodes : null;
  const year = typeof media.startDate?.year === 'number' ? media.startDate.year : null;
  const cover = typeof media.coverImage?.extraLarge === 'string'
    ? media.coverImage.extraLarge
    : typeof media.coverImage?.large === 'string'
      ? media.coverImage.large
      : '';

  const relations: AniListSeasonNode['relations'] = [];
  const edges = media.relations?.edges;
  if (Array.isArray(edges)) {
    for (const rawEdge of edges) {
      if (!rawEdge || typeof rawEdge !== 'object') continue;
      const edge = rawEdge as { relationType?: unknown; node?: unknown };
      if (edge.relationType !== 'PREQUEL' && edge.relationType !== 'SEQUEL') continue;
      const childNode = parseAniListSeasonNode(edge.node);
      if (!childNode) continue;
      relations.push({
        relationType: edge.relationType,
        node: childNode,
      });
    }
  }

  return {
    anilistId,
    malId,
    titleRomaji,
    titleEnglish,
    format,
    year,
    episodes,
    cover,
    relations,
  };
}

function isSeasonFormat(format: string | null): boolean {
  return format !== null && SEASON_FORMATS.has(format);
}

function isTraversableBridgeFormat(format: string | null): boolean {
  return format !== null && TRAVERSABLE_BRIDGE_FORMATS.has(format);
}

function orderSeasonNodesChronologically(
  nodes: Map<number, AniListSeasonNode>,
  sequelEdges: Map<number, Set<number>>,
): AniListSeasonNode[] {
  const byChrono = (a: AniListSeasonNode, b: AniListSeasonNode): number => {
    const yearDiff = (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER);
    if (yearDiff !== 0) return yearDiff;
    return a.anilistId - b.anilistId;
  };

  const allNodes = [...nodes.values()];
  if (allNodes.length <= 1) return allNodes;

  // Kahn's topological sort with chronological tie-breaking (handles multi-edges and bridge nodes)
  const inDegree = new Map<number, number>();
  for (const node of allNodes) {
    inDegree.set(node.anilistId, 0);
  }
  for (const [fromId, targets] of sequelEdges) {
    if (!nodes.has(fromId)) continue;
    for (const toId of targets) {
      if (!nodes.has(toId) || toId === fromId) continue;
      inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
    }
  }

  const ready: AniListSeasonNode[] = allNodes
    .filter((node) => (inDegree.get(node.anilistId) ?? 0) === 0)
    .sort(byChrono);

  const ordered: AniListSeasonNode[] = [];
  const placed = new Set<number>();

  while (ready.length > 0) {
    const current = ready.shift()!;
    if (placed.has(current.anilistId)) continue;
    placed.add(current.anilistId);
    ordered.push(current);

    const nextIds = sequelEdges.get(current.anilistId);
    if (nextIds) {
      for (const nextId of nextIds) {
        if (!nodes.has(nextId) || placed.has(nextId)) continue;
        const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
        inDegree.set(nextId, nextDeg);
        if (nextDeg === 0) {
          const nextNode = nodes.get(nextId);
          if (nextNode) {
            ready.push(nextNode);
          }
        }
      }
      ready.sort(byChrono);
    }
  }

  // Append any remaining nodes (e.g., if a cycle existed) in chronological order
  const remaining = allNodes.filter((n) => !placed.has(n.anilistId)).sort(byChrono);
  for (const node of remaining) {
    ordered.push(node);
  }

  return ordered;
}

async function resolveAnimeSeasonNodes(anilistId: number): Promise<AniListSeasonNode[]> {
  const metaPayload = await postAniList(ANILIST_BY_ID_QUERY, { id: anilistId });
  const rawRoot = (metaPayload as { data?: { Media?: unknown } }).data?.Media;
  const root = parseAniListSeasonNode(rawRoot, anilistId);
  if (!root) return [];

  if (!isSeasonFormat(root.format) || root.relations.length === 0) {
    return [root];
  }

  const nodes = new Map<number, AniListSeasonNode>([[root.anilistId, root]]);
  const fetched = new Set<number>([root.anilistId]);
  const sequelEdges = new Map<number, Set<number>>();
  const queue: number[] = [];

  const addSequelEdge = (earlierId: number, laterId: number): void => {
    if (earlierId === laterId) return;
    let targets = sequelEdges.get(earlierId);
    if (!targets) {
      targets = new Set<number>();
      sequelEdges.set(earlierId, targets);
    }
    targets.add(laterId);
  };

  const registerRelations = (source: AniListSeasonNode): void => {
    for (const rel of source.relations) {
      if (!isTraversableBridgeFormat(rel.node.format)) continue;
      if (!nodes.has(rel.node.anilistId)) {
        if (nodes.size >= MAX_SEASON_NODES) continue;
        nodes.set(rel.node.anilistId, rel.node);
      }
      if (rel.relationType === 'PREQUEL') {
        addSequelEdge(rel.node.anilistId, source.anilistId);
      } else {
        addSequelEdge(source.anilistId, rel.node.anilistId);
      }
      if (!fetched.has(rel.node.anilistId) && !queue.includes(rel.node.anilistId)) {
        queue.push(rel.node.anilistId);
      }
    }
  };

  registerRelations(root);

  while (queue.length > 0 && fetched.size < MAX_SEASON_NODES) {
    const nextId = queue.shift()!;
    if (fetched.has(nextId)) continue;
    fetched.add(nextId);

    try {
      const neighborPayload = await postAniList(ANILIST_BY_ID_QUERY, { id: nextId });
      const rawNeighbor = (neighborPayload as { data?: { Media?: unknown } }).data?.Media;
      const neighbor = parseAniListSeasonNode(rawNeighbor, nextId);
      if (neighbor) {
        nodes.set(neighbor.anilistId, neighbor);
        registerRelations(neighbor);
      }
    } catch {
      // Keep the basic neighbor metadata discovered from the parent edge
    }
  }

  const orderedAll = orderSeasonNodesChronologically(nodes, sequelEdges);
  const seasonNodes = orderedAll.filter(
    (node) => isSeasonFormat(node.format) || node.anilistId === root.anilistId,
  );
  return seasonNodes.length > 0 ? seasonNodes : [root];
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
      const video = (
        videos.find((candidate) => (
          candidate &&
          typeof candidate === 'object' &&
          typeof (candidate as { audio?: { link?: unknown } }).audio?.link === 'string'
        )) ??
        videos.find((candidate) => candidate && typeof candidate === 'object')
      ) as
        | { link?: unknown; audio?: { link?: unknown } }
        | undefined;
      const audioUrl = typeof video?.audio?.link === 'string' ? video.audio.link : null;
      const videoUrl = typeof video?.link === 'string' ? video.link : null;
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
    if (entries.length === 0) {
      results.push({
        animeId: anilistId,
        type: theme.type,
        sequence,
        title: typeof theme.song?.title === 'string'
          ? theme.song.title
          : `${theme.type} ${sequence}`,
        artist: artists.join(', '),
        episodesFrom: null,
        episodesTo: null,
        audioUrl: null,
        videoUrl: null,
      });
    }
  }
  return results;
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return JIKAN_RETRY_DEFAULT_MS;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(JIKAN_RETRY_MAX_MS, Math.max(0, Math.round(seconds * 1000)));
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.min(JIKAN_RETRY_MAX_MS, Math.max(0, dateMs - Date.now()));
  }
  return JIKAN_RETRY_DEFAULT_MS;
}

async function fetchThemesFromJikan(
  node: AniListSeasonNode,
): Promise<AnimeTheme[]> {
  if (!node.malId) return [];
  try {
    const jikanUrl = `${JIKAN_ENDPOINT}/anime/${node.malId}/themes`;
    let res = await fetchWithTimeout(
      jikanUrl,
      { headers: { 'X-User-Agent': MHL_USER_AGENT } },
      NETWORK_TIMEOUT_MS,
    );
    if (res.status === 429) {
      const retryMs = parseRetryAfterMs(res.headers.get('Retry-After'));
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      res = await fetchWithTimeout(
        jikanUrl,
        { headers: { 'X-User-Agent': MHL_USER_AGENT } },
        NETWORK_TIMEOUT_MS,
      );
    }
    if (!res.ok) return [];
    const payload = await res.json() as {
      data?: { openings?: unknown; endings?: unknown };
    };
    const openings = Array.isArray(payload.data?.openings)
      ? payload.data.openings.filter((item): item is string => typeof item === 'string')
      : [];
    const endings = Array.isArray(payload.data?.endings)
      ? payload.data.endings.filter((item): item is string => typeof item === 'string')
      : [];

    const themes: AnimeTheme[] = [
      ...openings.map((raw, idx) => {
        const parsed = parseJikanThemeEntry(raw, 'OP', idx + 1);
        return {
          animeId: node.anilistId,
          ...parsed,
          audioUrl: null,
          videoUrl: null,
        };
      }),
      ...endings.map((raw, idx) => {
        const parsed = parseJikanThemeEntry(raw, 'ED', idx + 1);
        return {
          animeId: node.anilistId,
          ...parsed,
          audioUrl: null,
          videoUrl: null,
        };
      }),
    ];
    return themes;
  } catch {
    return [];
  }
}

async function fetchAnimeThemesBySlug(slug: string, anilistId: number): Promise<AnimeTheme[]> {
  const themesUrl = new URL(`${ANIMETHEMES_ENDPOINT}/anime/${encodeURIComponent(slug)}`);
  themesUrl.searchParams.set('include', ANIMETHEMES_INCLUDE);
  const themesResponse = await fetchWithTimeout(
    themesUrl,
    { headers: { 'X-User-Agent': MHL_USER_AGENT } },
    NETWORK_TIMEOUT_MS,
  );
  if (!themesResponse.ok) return [];
  return parseAnimeThemes(await themesResponse.json(), anilistId);
}

async function fetchThemesFromAnimeThemes(
  node: AniListSeasonNode,
): Promise<AnimeTheme[]> {
  const candidateNames = Array.from(
    new Set([node.titleEnglish, node.titleRomaji].filter((v): v is string => Boolean(v && v.trim()))),
  );
  const normalizedNames = new Set(
    candidateNames.map((n) => n.replace(/\W+/g, '').toLocaleLowerCase()).filter(Boolean),
  );

  // Source 2a: Direct AnimeThemes lookup by AniList external ID
  try {
    const extUrl = new URL(`${ANIMETHEMES_ENDPOINT}/anime`);
    extUrl.searchParams.set('filter[has]', 'resources');
    extUrl.searchParams.set('filter[site]', 'AniList');
    extUrl.searchParams.set('filter[external_id]', String(node.anilistId));
    extUrl.searchParams.set('include', ANIMETHEMES_INCLUDE);

    const extResponse = await fetchWithTimeout(
      extUrl,
      { headers: { 'X-User-Agent': MHL_USER_AGENT } },
      NETWORK_TIMEOUT_MS,
    );
    if (extResponse.ok) {
      const payload = await extResponse.json() as {
        anime?: Array<{ name?: string; slug?: string; animethemes?: unknown }> | { animethemes?: unknown };
      };
      if (Array.isArray(payload.anime) && payload.anime.length > 0) {
        const withThemes = payload.anime.find(
          (item) => Array.isArray(item.animethemes) && item.animethemes.length > 0,
        );
        if (withThemes) {
          const parsed = parseAnimeThemes({ anime: withThemes }, node.anilistId);
          if (parsed.length > 0) return parsed;
        }
        const slugMatch = payload.anime.find(
          (item) => item.slug && normalizedNames.has(item.name?.replace(/\W+/g, '').toLocaleLowerCase() ?? ''),
        ) ?? payload.anime.find((item) => Boolean(item.slug));
        if (slugMatch?.slug) {
          const parsed = await fetchAnimeThemesBySlug(slugMatch.slug, node.anilistId);
          if (parsed.length > 0) return parsed;
        }
      } else if (payload.anime && typeof payload.anime === 'object') {
        const parsed = parseAnimeThemes(payload, node.anilistId);
        if (parsed.length > 0) return parsed;
      }
    }
  } catch {
    // Fall through to name-based lookup
  }

  // Source 2b: Fallback search by English / Romaji title
  for (const name of candidateNames) {
    try {
      const searchUrl = new URL(`${ANIMETHEMES_ENDPOINT}/anime`);
      searchUrl.searchParams.set('filter[name]', name);
      searchUrl.searchParams.set('page[size]', '15');
      const searchResponse = await fetchWithTimeout(
        searchUrl,
        { headers: { 'X-User-Agent': MHL_USER_AGENT } },
        NETWORK_TIMEOUT_MS,
      );
      if (!searchResponse.ok) continue;
      const searchPayload = await searchResponse.json() as {
        anime?: Array<{ name?: string; slug?: string }>;
      };
      const normalized = name.replace(/\W+/g, '').toLocaleLowerCase();
      const match = searchPayload.anime?.find(
        (item) => item.name?.replace(/\W+/g, '').toLocaleLowerCase() === normalized,
      );
      if (!match?.slug) continue;
      const parsed = await fetchAnimeThemesBySlug(match.slug, node.anilistId);
      if (parsed.length > 0) return parsed;
    } catch {
      // Try next candidate name
    }
  }

  return [];
}

interface AnisongDbEntry {
  isDub?: boolean;
  songType?: string;
  songName?: string;
  songArtist?: string;
  linked_ids?: {
    anilist?: number;
    myanimelist?: number;
  };
}

const ANISONGDB_SONG_TYPE_RE = /^(Opening|Ending)\s*(\d+)?/i;
const MAL_STREAMING_NOISE_RE = /^(?:Spotify|Apple Music|Amazon Music|Youtube Music|YouTube)(?:\s+(?:Spotify|Apple Music|Amazon Music|Youtube Music|YouTube))*$/i;

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function fetchThemesFromAnisongDb(
  node: AniListSeasonNode,
): Promise<AnimeTheme[]> {
  const candidateNames = Array.from(
    new Set([node.titleRomaji, node.titleEnglish].filter((v): v is string => Boolean(v && v.trim()))),
  );
  if (candidateNames.length === 0) return [];

  for (const searchName of candidateNames) {
    try {
      const res = await fetchWithTimeout(
        ANISONGDB_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-User-Agent': MHL_USER_AGENT,
          },
          body: JSON.stringify({
            anime_search_filter: {
              search: searchName.trim(),
              partial_match: true,
              max_other_artist: 99,
              group_by_site: false,
              and_logic: false,
            },
            and_logic: false,
            ignore_duplicate: false,
            opening_filter: true,
            ending_filter: true,
            insert_filter: false,
          }),
        },
        NETWORK_TIMEOUT_MS,
      );
      if (!res.ok) continue;
      const payload = await res.json() as unknown;
      if (!Array.isArray(payload)) continue;

      const seen = new Set<string>();
      const themes: AnimeTheme[] = [];
      for (const rawItem of payload) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const item = rawItem as AnisongDbEntry;
        if (item.isDub === true) continue;
        const linked = item.linked_ids;
        if (!linked) continue;
        const matchesAnilist = linked.anilist === node.anilistId;
        const matchesMal = Boolean(node.malId && linked.myanimelist === node.malId);
        if (!matchesAnilist && !matchesMal) continue;

        const typeMatch = String(item.songType ?? '').trim().match(ANISONGDB_SONG_TYPE_RE);
        if (!typeMatch) continue;
        const type: 'OP' | 'ED' = typeMatch[1].toLowerCase().startsWith('open') ? 'OP' : 'ED';
        const sequence = typeMatch[2] ? Number(typeMatch[2]) : 1;
        const title = stripNativeParenthetical(String(item.songName ?? '').trim()) || `${type} ${sequence}`;
        const artist = stripNativeParenthetical(String(item.songArtist ?? '').trim());
        const dedupeKey = `${type}:${sequence}:${title.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        themes.push({
          animeId: node.anilistId,
          type,
          sequence,
          title,
          artist,
          episodesFrom: null,
          episodesTo: null,
          audioUrl: null,
          videoUrl: null,
        });
      }

      if (themes.length > 0) {
        themes.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'OP' ? -1 : 1;
          if (a.sequence !== b.sequence) return a.sequence - b.sequence;
          return a.title.localeCompare(b.title);
        });
        return themes;
      }
    } catch {
      // Try next candidate name or fall back
    }
  }
  return [];
}

async function fetchThemesFromMalHtml(
  node: AniListSeasonNode,
): Promise<AnimeTheme[]> {
  if (!node.malId) return [];
  try {
    const res = await fetchWithTimeout(
      `${MAL_BASE_URL}/${node.malId}`,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'X-User-Agent': MHL_USER_AGENT,
        },
      },
      NETWORK_TIMEOUT_MS,
    );
    if (!res.ok) return [];
    const htmlText = await res.text();
    if (!htmlText) return [];

    const themes: AnimeTheme[] = [];
    for (const [normType, clsName] of [['OP', 'opnening'], ['ED', 'ending']] as const) {
      const blockMatch = htmlText.match(
        new RegExp(`class="theme-songs js-theme-songs ${clsName}"[\\s\\S]*?<\\/table>`, 'i'),
      );
      if (!blockMatch) continue;
      const rows = blockMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      let seqCounter = 0;
      for (const rowHtml of rows) {
        const text = decodeBasicHtmlEntities(rowHtml.replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (!text || MAL_STREAMING_NOISE_RE.test(text)) continue;
        seqCounter += 1;
        const parsed = parseJikanThemeEntry(text, normType, seqCounter);
        if (!parsed.title || MAL_STREAMING_NOISE_RE.test(parsed.title)) continue;
        themes.push({
          animeId: node.anilistId,
          ...parsed,
          audioUrl: null,
          videoUrl: null,
        });
      }
    }
    return themes;
  } catch {
    return [];
  }
}

async function getAnimeThemesDirect(
  anilistId: number,
): Promise<{ themes: AnimeTheme[]; seasons: AnimeSeason[] }> {
  const seasonNodes = await resolveAnimeSeasonNodes(anilistId);
  if (seasonNodes.length === 0) {
    return { themes: [], seasons: [] };
  }

  const seasons = await mapWithConcurrency(
    seasonNodes,
    SEASON_THEME_CONCURRENCY,
    async (node, index): Promise<AnimeSeason> => {
      const seasonNumber = index + 1;
      const seasonTitle = node.titleEnglish || node.titleRomaji;

      // Primary: AnisongDB (fast, accurate linked_ids for AniList & MAL)
      let rawThemes = await fetchThemesFromAnisongDb(node);
      // Fallback 1: MyAnimeList HTML page
      if (rawThemes.length === 0) {
        rawThemes = await fetchThemesFromMalHtml(node);
      }
      // Fallback 2: Jikan (MAL) when malId is available
      if (rawThemes.length === 0) {
        rawThemes = await fetchThemesFromJikan(node);
      }
      // Fallback 3: AnimeThemes (by AniList external ID, then by title)
      if (rawThemes.length === 0) {
        rawThemes = await fetchThemesFromAnimeThemes(node);
      }

      const annotatedThemes: AnimeTheme[] = rawThemes.map((theme) => ({
        ...theme,
        seasonNumber,
        seasonTitle,
        malId: node.malId,
      }));

      return {
        anilistId: node.anilistId,
        malId: node.malId,
        seasonNumber,
        titleRomaji: node.titleRomaji,
        titleEnglish: node.titleEnglish,
        year: node.year,
        episodes: node.episodes,
        cover: node.cover,
        themes: annotatedThemes,
      };
    },
  );

  const themes = seasons.flatMap((season) => season.themes);
  return { themes, seasons };
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

function normalizeForTrackMatch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isReliableDeezerMatch(theme: AnimeTheme, candidate: Track): boolean {
  const themeAllowsUnofficial = UNOFFICIAL_TRACK_PATTERN.test(theme.title);
  if (!themeAllowsUnofficial) {
    if (UNOFFICIAL_TRACK_PATTERN.test(candidate.title) || UNOFFICIAL_TRACK_PATTERN.test(candidate.album)) {
      return false;
    }
  }

  const wantedTitle = normalizeForTrackMatch(theme.title);
  const candTitle = normalizeForTrackMatch(candidate.canonicalTitle || candidate.title);
  if (!wantedTitle || !candTitle) return false;

  const titleMatches = (
    candTitle === wantedTitle
    || (wantedTitle.length >= 3 && candTitle.includes(wantedTitle))
    || (candTitle.length >= 3 && wantedTitle.includes(candTitle))
  );
  if (!titleMatches) return false;

  const wantedArtist = normalizeForTrackMatch(theme.artist);
  if (!wantedArtist) return true;

  const candArtist = normalizeForTrackMatch(candidate.artist);
  if (!candArtist) return false;

  if (candArtist === wantedArtist || candArtist.includes(wantedArtist) || wantedArtist.includes(candArtist)) {
    return true;
  }

  const wantedTokens = wantedArtist.split(' ').filter((w) => w.length >= 2);
  const candTokens = new Set(candArtist.split(' ').filter((w) => w.length >= 2));
  if (wantedTokens.length === 0) return false;
  const overlap = wantedTokens.filter((w) => candTokens.has(w)).length;
  return overlap / wantedTokens.length >= 0.6;
}

function findReliableDeezerMatch(theme: AnimeTheme, tracks: Track[]): Track | null {
  const matches = tracks.filter((track) => isReliableDeezerMatch(theme, track));
  if (matches.length === 0) return null;
  // Prefer studio full-length recordings (>= 120s) over short TV-size edits
  return matches.find((track) => track.duration >= 120) ?? matches[0];
}

function isOneTapCandidate(candidate: DownloadCandidate | undefined): boolean {
  if (!candidate) return false;
  if (candidate.verification === 'rejected') return false;
  if (!Array.isArray(candidate.rejectionReasons)) {
    return candidate.verification === 'verified' || candidate.verification === 'probable';
  }
  return canDownloadWithOneTap(candidate);
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
        return { success: false, error: 'Unsupported platform' };
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
  if (cached) {
    return {
      success: true,
      themes: cached.themes,
      ...(cached.seasons ? { seasons: cached.seasons } : {}),
    };
  }

  const pending = themesRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<AnimeThemesResponse> => {
    try {
      let themes: AnimeTheme[];
      let seasons: AnimeSeason[] | undefined;

      if (isPyWebViewPlatform()) {
        const api = requirePyWebViewApi();
        const data = await api.anime_get_themes?.(anilistId) as DesktopAnimeThemesPayload | undefined;
        if (!data) throw new Error('anime_get_themes unavailable in desktop bridge');
        if (!data.success) {
          return { success: false, error: data.error || 'Desktop themes fetch failed' };
        }
        themes = data.themes || [];
        if (Array.isArray(data.seasons)) {
          seasons = data.seasons;
        }
      } else if (isAndroidPlatform()) {
        const direct = await getAnimeThemesDirect(anilistId);
        themes = direct.themes;
        seasons = direct.seasons;
      } else {
        return { success: false, error: 'Unsupported platform' };
      }

      if (themes.length > 0) {
        const payload: CachedAnimeThemesPayload = {
          themes,
          ...(seasons ? { seasons } : {}),
        };
        setCachedValue(themesCache, cacheKey, payload, ANIME_CACHE_TTL_MS, ANIME_CACHE_MAX_ENTRIES);
      }
      return {
        success: true,
        themes,
        ...(seasons ? { seasons } : {}),
      };
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
  animeCover = '',
): Promise<DownloadAnimeThemeResponse> {
  const virtualTrack: Track = {
    id: `anime-${theme.animeId}-${theme.type}-${theme.sequence}`,
    title: theme.title,
    canonicalTitle: theme.title,
    artist: theme.artist,
    album: animeTitle,
    canonicalAlbum: animeTitle,
    duration: 0,
    cover: animeCover,
  };

  let resolvedTrack: Track = virtualTrack;

  const catalogQuery = `${theme.title} ${theme.artist}`.trim();
  if (catalogQuery && typeof searchDeezer === 'function') {
    try {
      const deezerResults = await searchDeezer(catalogQuery, 0, 8);
      if (Array.isArray(deezerResults) && deezerResults.length > 0) {
        const matched = findReliableDeezerMatch(theme, deezerResults);
        if (matched) {
          resolvedTrack = {
            ...matched,
            cover: matched.cover || animeCover,
            album: matched.album || animeTitle,
            canonicalAlbum: matched.canonicalAlbum || matched.album || animeTitle,
          };
        }
      }
    } catch {
      // Silently fall back to virtualTrack with official anime theme metadata
    }
  }

  try {
    let candidates = await getDownloadCandidates(resolvedTrack, true, { depth: 'light' });
    let best = candidates[0];

    if (!isOneTapCandidate(best)) {
      const deepCandidates = await getDownloadCandidates(resolvedTrack, true, { depth: 'deep' });
      if (deepCandidates.length > 0) {
        candidates = deepCandidates;
        best = candidates[0];
      }
    }

    if (best && isOneTapCandidate(best)) {
      return {
        success: true,
        track: resolvedTrack,
        videoId: best.videoId,
        candidates,
        sourceUrl: theme.audioUrl ?? undefined,
      };
    }

    return {
      success: false,
      error: candidates.length > 0
        ? 'FULL_TRACK_SELECTION_REQUIRED'
        : 'FULL_TRACK_UNAVAILABLE',
      candidates,
      track: resolvedTrack,
      sourceUrl: theme.audioUrl ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    return { success: false, error: message };
  }
}
