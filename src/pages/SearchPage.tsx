import { useShallow } from 'zustand/react/shallow';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Download, Play, Pause, Search, Loader2, Music, CheckCircle, X, ArrowLeft, Tv, Zap, RefreshCw, Sparkles, Clipboard, Disc3 } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { getDownloadCandidates, type DownloadCandidate } from '@/lib/api/musicApi';
import type { ResolvedCollection, Track } from '@/types/music';
import { GLOBAL_ARTISTS_POOL, buildAffinityPool, buildArtistVisuals, artistGenre } from '@/data/globalArtists';
import { useI18n } from '@/lib/useI18n';
import { CandidatePicker } from '@/components/ui/CandidatePicker';
import { CollectionPanel } from '@/components/ui/CollectionPanel';
import { AnimeCard } from '@/components/ui/AnimeCard';
import { ThemeRow } from '@/components/ui/ThemeRow';
import { AnimeModeBadge } from '@/components/ui/AnimeModeBadge';
import { searchAnime, getAnimeThemes, downloadAnimeTheme } from '@/lib/api/animeApi';
import { looksAnimeLikeQuery } from '@/lib/util/animeDetector';
import type { Anime, AnimeSeason, AnimeTheme } from '@/types/anime';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { canDownloadWithOneTap } from '@/lib/download/candidateResolver';
import { CandidateScheduler } from '@/lib/download/candidateScheduler';
import { isDirectMediaUrl, isSupportedCollectionUrl, isUnsupportedCollectionUrl, resolveTrackFromUrl } from '@/lib/music/urlResolver';
import { resolveCollectionFromUrl, resolveDeezerAlbumById } from '@/lib/music/collectionResolver';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function candidateTrackKey(track: Track): string {
  return String(track.deezerId ?? track.id);
}

function artistMonogram(name: string): string {
  const words = name.replace(/[()[\].!]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '♪';
  return words.slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase();
}

function normalizeThemeMatchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAnimeThemeDownloadMatch(track: Track, theme: AnimeTheme, key: string): boolean {
  if (track.id === `anime-${key}`) return true;
  const wantedTitle = normalizeThemeMatchText(theme.title);
  const candTitle = normalizeThemeMatchText(track.canonicalTitle || track.title);
  if (!wantedTitle || !candTitle) return false;
  const titleMatch = (
    candTitle === wantedTitle
    || (wantedTitle.length >= 3 && candTitle.includes(wantedTitle))
    || (candTitle.length >= 3 && wantedTitle.includes(candTitle))
  );
  if (!titleMatch) return false;
  const wantedArtist = normalizeThemeMatchText(theme.artist);
  if (!wantedArtist) return true;
  const candArtist = normalizeThemeMatchText(track.artist);
  if (!candArtist) return false;
  return (
    candArtist === wantedArtist
    || candArtist.includes(wantedArtist)
    || wantedArtist.includes(candArtist)
  );
}

type BestCandidateEntry = {
  videoId: string;
};
type ResolutionState = 'resolving' | 'verified' | 'review' | 'none';

function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]'); } catch { return []; }
  });
  const remove = useCallback((term: string) => {
    const updated = recent.filter((s) => s !== term);
    setRecent(updated);
    localStorage.setItem('mhl-recent-searches', JSON.stringify(updated));
  }, [recent]);
  const refresh = useCallback(() => {
    try { setRecent(JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]')); } catch { /* */ }
  }, []);
  return { recent, remove, refresh };
}

export default function SearchPage() {
  const { t } = useI18n();
  const {
    searchQuery,
    searchResults,
    isSearching,
    performSearch,
    loadMoreResults,
    hasMoreResults,
    isLoadingMore,
    playTrack,
    currentTrack,
    isPlaying,
    startDownloadWithVideoId,
    startDownloadWithSourceUrl,
    startBatchDownload,
    downloads,
    mostDownloadedArtists,
    animeSearchEnabled,
    autoCandidateResolution,
    resolutionProfile,
    cellularResolutionPolicy,
    editionPreference,
    autoDownload,
    allowLongAudioDownloads,
    setDirectTrack,
    clearSearch,
  } = useMusicStore(useShallow((s) => ({
    searchQuery: s.searchQuery,
    searchResults: s.searchResults,
    isSearching: s.isSearching,
    performSearch: s.performSearch,
    loadMoreResults: s.loadMoreResults,
    hasMoreResults: s.hasMoreResults,
    isLoadingMore: s.isLoadingMore,
    playTrack: s.playTrack,
    currentTrack: s.currentTrack,
    isPlaying: s.isPlaying,
    startDownloadWithVideoId: s.startDownloadWithVideoId,
    startDownloadWithSourceUrl: s.startDownloadWithSourceUrl,
    startBatchDownload: s.startBatchDownload,
    downloads: s.downloads,
    mostDownloadedArtists: s.mostDownloadedArtists,
    animeSearchEnabled: s.animeSearchEnabled,
    autoCandidateResolution: s.autoCandidateResolution,
    resolutionProfile: s.resolutionProfile,
    cellularResolutionPolicy: s.cellularResolutionPolicy,
    editionPreference: s.editionPreference,
    autoDownload: s.autoDownload,
    allowLongAudioDownloads: s.allowLongAudioDownloads,
    setDirectTrack: s.setDirectTrack,
    clearSearch: s.clearSearch,
  })));

  const [query, setQuery] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);
  const [bestCandidates, setBestCandidates] = useState<Record<string, BestCandidateEntry>>({});
  const [bestResolvingId, setBestResolvingId] = useState<string | null>(null);
  const [resolutionStates, setResolutionStates] = useState<Record<string, ResolutionState>>({});
  const [artistRotation, setArtistRotation] = useState(0);
  const [artistExclusions, setArtistExclusions] = useState<string[]>([]);
  const { recent, remove: removeRecent, refresh: refreshRecent } = useRecentSearches();
  const isNativeProduct = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && 'pywebview' in window);
  const autoDownloadTriggeredRef = useRef<string | null>(null);
  const scheduler = useMemo(() => new CandidateScheduler({
    profile: resolutionProfile,
    cellularPolicy: cellularResolutionPolicy,
    editionPreference,
    animeSearchEnabled,
  }), [animeSearchEnabled, cellularResolutionPolicy, editionPreference, resolutionProfile]);

  // ─── Anime mode state ───
  const [animeMode, setAnimeMode] = useState(false);
  const animeModeRef = useRef(false);
  animeModeRef.current = animeMode;
  const animeBypassQueryRef = useRef<string | null>(null);
  const [animeResults, setAnimeResults] = useState<Anime[]>([]);
  const [isSearchingAnime, setIsSearchingAnime] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [animeThemes, setAnimeThemes] = useState<AnimeTheme[]>([]);
  const [animeSeasons, setAnimeSeasons] = useState<AnimeSeason[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [downloadingThemeKey, setDownloadingThemeKey] = useState<string | null>(null);
  const animeRequestId = useRef(0);
  const themesRequestId = useRef(0);

  // ─── Collection (Album / Playlist) & Direct URL state ───
  const [activeCollection, setActiveCollection] = useState<ResolvedCollection | null>(null);
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  const collectionRequestId = useRef(0);
  const directUrlRequestId = useRef(0);
  const lastHandledDirectUrlRef = useRef<string | null>(null);

  const handleDownloadClick = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (isDownloading(track.id)) return;
    setPickerTrack(track);
  };

  const cacheBestCandidate = useCallback((track: Track, candidates: DownloadCandidate[] | null) => {
    if (!isNativeProduct) return;
    const key = candidateTrackKey(track);
    const verified = candidates?.find(canDownloadWithOneTap);
    setResolutionStates((current) => ({
      ...current,
      [key]: verified ? 'verified' : candidates?.length ? 'review' : 'none',
    }));
    setBestCandidates((current) => {
      if (verified) {
        return { ...current, [key]: { videoId: verified.videoId } };
      }
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, [isNativeProduct]);

  const handleDownloadPrefetch = useCallback((track: Track) => {
    if (!isNativeProduct || !autoCandidateResolution) return;
    const key = candidateTrackKey(track);
    setResolutionStates((current) => ({ ...current, [key]: 'resolving' }));
    scheduler.enqueue(track, 'visible', (candidates) => cacheBestCandidate(track, candidates));
  }, [autoCandidateResolution, cacheBestCandidate, isNativeProduct, scheduler]);

  const handleBestDownloadClick = useCallback(async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (downloads.some((d) => d.track.id === track.id && d.status === 'downloading')) return;
    const key = candidateTrackKey(track);
    const cached = bestCandidates[key];
    if (cached) {
      startDownloadWithVideoId(track, cached.videoId);
      return;
    }

    setBestResolvingId(key);
    try {
      const candidates = await getDownloadCandidates(track, animeSearchEnabled, {
        depth: 'light', editionPreference,
      });
      cacheBestCandidate(track, candidates);
      const verified = candidates.find(canDownloadWithOneTap);
      if (verified) {
        startDownloadWithVideoId(track, verified.videoId);
      } else {
        setPickerTrack(track);
      }
    } catch {
      setPickerTrack(track);
    } finally {
      setBestResolvingId((current) => (current === key ? null : current));
    }
  }, [animeSearchEnabled, bestCandidates, cacheBestCandidate, downloads, editionPreference, startDownloadWithVideoId]);

  // ─── Anime mode handlers ───
  const handleAnimeCardClick = useCallback(async (anime: Anime) => {
    const requestId = ++themesRequestId.current;
    setSelectedAnime(anime);
    setAnimeThemes([]);
    setAnimeSeasons([]);
    setSelectedSeasonNumber(null);
    setIsLoadingThemes(true);
    const response = await getAnimeThemes(anime.id);
    if (requestId !== themesRequestId.current) return;
    setIsLoadingThemes(false);
    if (response.success && response.themes) {
      const seasons = response.seasons ?? [];
      setAnimeThemes(response.themes);
      setAnimeSeasons(seasons);
      if (seasons.length > 1) {
        const firstWithThemes = seasons.find((s) => s.themes.length > 0) ?? seasons[0];
        setSelectedSeasonNumber(firstWithThemes.seasonNumber);
      } else {
        setSelectedSeasonNumber(null);
      }
    } else {
      setAnimeThemes([]);
      setAnimeSeasons([]);
      setSelectedSeasonNumber(null);
      const errMsg = response.error ?? t('themeFetchError');
      toast.error(errMsg);
    }
  }, [t]);

  const seasonCoverMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const season of animeSeasons) {
      if (season.cover) {
        map.set(season.anilistId, season.cover);
      }
    }
    return map;
  }, [animeSeasons]);

  const handleAnimeModeToggle = useCallback(() => {
    const trimmed = query.trim();
    animeBypassQueryRef.current = trimmed || null;
    animeModeRef.current = false;
    setAnimeMode(false);
    setAnimeResults([]);
    setSelectedAnime(null);
    setAnimeThemes([]);
    setAnimeSeasons([]);
    setSelectedSeasonNumber(null);
    themesRequestId.current++;
    animeRequestId.current++;
    if (trimmed) {
      performSearch(trimmed);
      refreshRecent();
    }
  }, [query, performSearch, refreshRecent]);

  const handleBackToAnimeResults = useCallback(() => {
    setSelectedAnime(null);
    setAnimeThemes([]);
    setAnimeSeasons([]);
    setSelectedSeasonNumber(null);
  }, []);

  const handleDownloadSeason = useCallback(
    (themes: AnimeTheme[], animeTitle: string, seasonCover: string) => {
      if (themes.length === 0) return;
      const tracks: Track[] = themes.map((th) => ({
        id: `anime-${th.animeId}-${th.type}-${th.sequence}`,
        title: th.title || `${animeTitle} ${th.type} ${th.sequence}`,
        canonicalTitle: th.title || `${animeTitle} ${th.type} ${th.sequence}`,
        artist: th.artist || animeTitle,
        album: th.seasonTitle || animeTitle,
        canonicalAlbum: th.seasonTitle || animeTitle,
        duration: 0,
        cover: seasonCoverMap.get(th.animeId) || seasonCover,
      }));
      const result = startBatchDownload(tracks);
      if (result.queued > 0) {
        toast.success(t('animeSeasonQueued', { count: result.queued }));
      } else {
        toast(t('collectionAllAlreadyQueued'));
      }
    },
    [seasonCoverMap, startBatchDownload, t],
  );

  const handleThemeDownload = useCallback(
    (theme: AnimeTheme, animeTitle: string, seasonCover?: string) => {
      const key = `${theme.animeId}-${theme.type}-${theme.sequence}`;
      if (downloadingThemeKey === key) return;
      setDownloadingThemeKey(key);
      const toastId = `anime-theme-${key}`;
      const displayTitle = theme.title || `${animeTitle} ${theme.type} ${theme.sequence}`;
      toast.loading(t('animeResolvingTheme', { title: displayTitle }), { id: toastId });
      downloadAnimeTheme(theme, animeTitle, seasonCover ?? selectedAnime?.cover ?? '')
        .then((response) => {
          if (response.success && response.videoId && response.track) {
            startDownloadWithVideoId(response.track, response.videoId);
            toast.success(t('animeThemeQueued', { title: response.track.title || displayTitle }), { id: toastId });
          } else if (response.success && response.sourceUrl && response.track) {
            startDownloadWithSourceUrl(response.track, response.sourceUrl);
            toast.success(t('animeThemeQueued', { title: response.track.title || displayTitle }), { id: toastId });
          } else if (response.candidates && response.candidates.length > 0 && response.track) {
            toast.dismiss(toastId);
            setPickerTrack(response.track);
          } else {
            toast.error(response.error ?? t('downloadFailed'), { id: toastId });
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : t('downloadFailed');
          toast.error(message, { id: toastId });
        })
        .finally(() => {
          setDownloadingThemeKey((current) => (current === key ? null : current));
        });
    },
    [downloadingThemeKey, selectedAnime?.cover, startDownloadWithSourceUrl, startDownloadWithVideoId, t],
  );
  const [inputFocused, setInputFocused] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const suggestedSearches = useMemo(
    () => buildAffinityPool(mostDownloadedArtists, 18, {
      rotation: artistRotation,
      exclude: artistExclusions,
    }),
    [artistExclusions, artistRotation, mostDownloadedArtists],
  );
  const suggestedArtists = useMemo(
    () => buildArtistVisuals(suggestedSearches),
    [suggestedSearches],
  );
  const reduceResultMotion = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return (navigator.hardwareConcurrency || 4) <= 4
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const clearActiveCollection = useCallback(() => {
    collectionRequestId.current++;
    lastHandledDirectUrlRef.current = null;
    setActiveCollection(null);
    setIsLoadingCollection(false);
  }, []);

  const isDownloading = useCallback(
    (trackId: string) =>
      downloads.some((d) => d.track.id === trackId && d.status === 'downloading'),
    [downloads],
  );

  const isTrackBusy = useCallback(
    (trackId: string) =>
      downloads.some((d) => d.track.id === trackId && (d.status === 'downloading' || d.status === 'queued')),
    [downloads],
  );

  const isDownloaded = useCallback(
    (trackId: string) =>
      downloads.some((d) => d.track.id === trackId && d.status === 'completed'),
    [downloads],
  );

  const handleOpenAlbum = useCallback(async (albumId: number) => {
    const reqId = ++collectionRequestId.current;
    directUrlRequestId.current++;
    lastHandledDirectUrlRef.current = null;
    setIsLoadingCollection(true);
    toast.loading(t('resolvingCollection'), { id: 'url-resolve' });
    try {
      const collection = await resolveDeezerAlbumById(albumId);
      if (reqId !== collectionRequestId.current) return;
      if (collection && collection.tracks.length > 0) {
        setActiveCollection(collection);
        toast.success(
          t('collectionResolved', { title: collection.title, count: collection.tracks.length }),
          { id: 'url-resolve' },
        );
      } else {
        toast.error(t('collectionLoadError'), { id: 'url-resolve' });
      }
    } catch {
      if (reqId !== collectionRequestId.current) return;
      toast.error(t('collectionLoadError'), { id: 'url-resolve' });
    } finally {
      if (reqId === collectionRequestId.current) {
        setIsLoadingCollection(false);
      }
    }
  }, [t]);

  const handleCollectionDownloadAll = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    const result = startBatchDownload(tracks);
    if (result.queued > 0) {
      toast.success(t('collectionBatchQueued', { count: result.queued }));
    } else {
      toast(t('collectionAllAlreadyQueued'));
    }
  }, [startBatchDownload, t]);

  const handleCollectionDownloadTrack = useCallback((track: Track) => {
    if (isTrackBusy(track.id)) return;
    if (track.youtubeId) {
      startDownloadWithVideoId(track, track.youtubeId);
    } else {
      startBatchDownload([track]);
    }
  }, [isTrackBusy, startBatchDownload, startDownloadWithVideoId]);

  const handleDirectUrl = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    if (lastHandledDirectUrlRef.current === trimmed) return;
    lastHandledDirectUrlRef.current = trimmed;
    const reqId = ++directUrlRequestId.current;

    if (isSupportedCollectionUrl(trimmed)) {
      const colReqId = ++collectionRequestId.current;
      setIsLoadingCollection(true);
      toast.loading(t('resolvingCollection'), { id: 'url-resolve' });
      try {
        const collection = await resolveCollectionFromUrl(trimmed);
        if (reqId !== directUrlRequestId.current || colReqId !== collectionRequestId.current) return;
        if (collection && collection.tracks.length > 0) {
          setActiveCollection(collection);
          animeModeRef.current = false;
          setAnimeMode(false);
          setSelectedAnime(null);
          setAnimeThemes([]);
          setAnimeSeasons([]);
          setSelectedSeasonNumber(null);
          toast.success(
            t('collectionResolved', { title: collection.title, count: collection.tracks.length }),
            { id: 'url-resolve' },
          );
        } else {
          lastHandledDirectUrlRef.current = null;
          toast.error(t('collectionLoadError'), { id: 'url-resolve' });
        }
      } catch {
        if (reqId !== directUrlRequestId.current || colReqId !== collectionRequestId.current) return;
        lastHandledDirectUrlRef.current = null;
        toast.error(t('collectionLoadError'), { id: 'url-resolve' });
      } finally {
        if (reqId === directUrlRequestId.current && colReqId === collectionRequestId.current) {
          setIsLoadingCollection(false);
        }
      }
      return;
    }

    if (isUnsupportedCollectionUrl(trimmed)) {
      collectionRequestId.current++;
      setActiveCollection(null);
      setIsLoadingCollection(false);
      toast.error(t('invalidMediaUrl'), { id: 'url-resolve' });
      return;
    }

    collectionRequestId.current++;
    setActiveCollection(null);
    setIsLoadingCollection(false);
    toast.loading(t('resolvingUrl'), { id: 'url-resolve' });
    try {
      const resolvedTrack = await resolveTrackFromUrl(trimmed);
      if (reqId !== directUrlRequestId.current) return;
      if (resolvedTrack) {
        // Validación de podcasts / audios extensos (>20 min)
        if ((resolvedTrack.isLongAudio || resolvedTrack.isPodcast) && !allowLongAudioDownloads) {
          toast.error(t('longAudioBlocked'), { id: 'url-resolve', duration: 7000 });
          return;
        }

        if (resolvedTrack.isLongAudio) {
          toast.warning(t('longAudioWarning'), { duration: 6000 });
        }

        toast.success(
          t('urlResolved', { title: resolvedTrack.title, artist: resolvedTrack.artist }),
          { id: 'url-resolve' }
        );
        setDirectTrack(resolvedTrack);
        if (resolvedTrack.youtubeId) {
          const key = candidateTrackKey(resolvedTrack);
          setBestCandidates((cur) => ({ ...cur, [key]: { videoId: resolvedTrack.youtubeId! } }));
          setResolutionStates((cur) => ({ ...cur, [key]: 'verified' }));
        }
        if (autoDownload) {
          if (resolvedTrack.youtubeId) {
            startDownloadWithVideoId(resolvedTrack, resolvedTrack.youtubeId);
          } else {
            startBatchDownload([resolvedTrack]);
          }
        }
      } else {
        lastHandledDirectUrlRef.current = null;
        toast.error(t('noResults'), { id: 'url-resolve' });
      }
    } catch (err) {
      if (reqId !== directUrlRequestId.current) return;
      lastHandledDirectUrlRef.current = null;
      console.error('Error resolving URL:', err);
      toast.error(t('noResults'), { id: 'url-resolve' });
    }
  }, [allowLongAudioDownloads, autoDownload, setDirectTrack, startBatchDownload, startDownloadWithVideoId, t]);

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText) {
      setQuery(pastedText);
      if (
        isDirectMediaUrl(pastedText)
        || isSupportedCollectionUrl(pastedText)
        || isUnsupportedCollectionUrl(pastedText)
      ) {
        e.preventDefault();
        void handleDirectUrl(pastedText);
      }
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) {
          setQuery(text);
          if (
            isDirectMediaUrl(text)
            || isSupportedCollectionUrl(text)
            || isUnsupportedCollectionUrl(text)
          ) {
            void handleDirectUrl(text);
          } else {
            directUrlRequestId.current++;
            clearActiveCollection();
            performSearch(text);
            refreshRecent();
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSearch = () => {
    const sanitized = Array.from(query)
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .trim();
    if (!sanitized || isSearching) return;
    
    if (
      isDirectMediaUrl(sanitized)
      || isSupportedCollectionUrl(sanitized)
      || isUnsupportedCollectionUrl(sanitized)
    ) {
      void handleDirectUrl(sanitized);
      return;
    }
    
    directUrlRequestId.current++;
    clearActiveCollection();
    performSearch(sanitized);
    refreshRecent();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSuggestionClick = (term: string) => {
    directUrlRequestId.current++;
    clearActiveCollection();
    setQuery(term);
    performSearch(term);
    refreshRecent();
  };

  const rotateArtistSuggestions = () => {
    setArtistExclusions((current) => [...current, ...suggestedSearches].slice(-300));
    setArtistRotation((current) => current + 1);
  };

  useEffect(() => {
    scheduler.startSession();
    setBestCandidates({});
    setResolutionStates({});
    autoDownloadTriggeredRef.current = null;
    if (!autoCandidateResolution || !isNativeProduct || animeMode || searchResults.length === 0 || isSearching) return;
    for (const track of searchResults.slice(0, 5)) {
      const key = candidateTrackKey(track);
      setResolutionStates((current) => ({ ...current, [key]: 'resolving' }));
      scheduler.enqueue(track, 'initial', (candidates) => cacheBestCandidate(track, candidates));
    }
    const idleTimer = window.setTimeout(() => {
      for (const track of searchResults.slice(5)) {
        scheduler.enqueue(track, 'idle', (candidates) => cacheBestCandidate(track, candidates));
      }
    }, 1200);
    return () => {
      window.clearTimeout(idleTimer);
      scheduler.startSession();
    };
  }, [animeMode, autoCandidateResolution, cacheBestCandidate, isNativeProduct, isSearching, scheduler, searchQuery, searchResults]);

  // ─── Auto-download: descarga automática del primer resultado verificado ───
  useEffect(() => {
    if (!autoDownload || !isNativeProduct || animeMode || searchResults.length === 0) return;
    const firstTrack = searchResults[0];
    const firstKey = candidateTrackKey(firstTrack);
    if (autoDownloadTriggeredRef.current === searchQuery) return;
    if (isDownloading(firstTrack.id) || isDownloaded(firstTrack.id)) return;
    const state = resolutionStates[firstKey];
    const cached = bestCandidates[firstKey];
    if (state === 'verified' && cached) {
      autoDownloadTriggeredRef.current = searchQuery;
      startDownloadWithVideoId(firstTrack, cached.videoId);
      toast(t('autoDownloadStarted', { title: firstTrack.title, artist: firstTrack.artist }), {
        duration: 4000,
      });
    }
  }, [autoDownload, animeMode, bestCandidates, isDownloaded, isDownloading, isNativeProduct, resolutionStates, searchQuery, searchResults, startDownloadWithVideoId, t]);

  useEffect(() => {
    const updateVisibility = () => scheduler.setPaused(document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [scheduler]);

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMoreResults && !isLoadingMore && searchResults.length > 0) {
        loadMoreResults();
      }
    },
    [hasMoreResults, isLoadingMore, searchResults.length, loadMoreResults]
  );

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      animeBypassQueryRef.current = null;
      animeModeRef.current = false;
      directUrlRequestId.current++;
      lastHandledDirectUrlRef.current = null;
      animeRequestId.current++;
      themesRequestId.current++;
      setAnimeMode(false);
      setAnimeResults([]);
      setSelectedAnime(null);
      setAnimeThemes([]);
      setAnimeSeasons([]);
      setSelectedSeasonNumber(null);
      setIsSearchingAnime(false);
      setIsLoadingThemes(false);
      clearActiveCollection();
      if (searchQuery) {
        const timeout = window.setTimeout(() => {
          performSearch('');
        }, 150);
        return () => window.clearTimeout(timeout);
      }
      return;
    }
    if (animeBypassQueryRef.current && animeBypassQueryRef.current !== trimmed) {
      animeBypassQueryRef.current = null;
    }
    if (trimmed.length < 2) return;

    // Direct/collection/unsupported URLs MUST be checked BEFORE anime heuristics
    // so URLs containing words like "anime"/"opening"/"ost" never trigger AniList
    // or destroy an open CollectionPanel.
    if (
      isDirectMediaUrl(trimmed)
      || isSupportedCollectionUrl(trimmed)
      || isUnsupportedCollectionUrl(trimmed)
    ) {
      if (lastHandledDirectUrlRef.current === trimmed) return;
      const timeout = window.setTimeout(() => {
        void handleDirectUrl(trimmed);
      }, 300);
      return () => window.clearTimeout(timeout);
    }

    // Query is regular text (not a URL): cancel any in-flight direct URL resolution.
    if (lastHandledDirectUrlRef.current !== null) {
      lastHandledDirectUrlRef.current = null;
    }
    directUrlRequestId.current++;

    // Anime mode (opt-in): if the toggle is on and the query smells like anime,
    // call searchAnime() and render the anime grid instead of the songs grid.
    if (
      animeSearchEnabled
      && looksAnimeLikeQuery(trimmed)
      && animeBypassQueryRef.current !== trimmed
    ) {
      const myRequest = ++animeRequestId.current;
      const timeout = window.setTimeout(() => {
        if (myRequest !== animeRequestId.current) return;
        clearActiveCollection();
        setIsSearchingAnime(true);
        setSelectedAnime(null);
        setAnimeThemes([]);
        setAnimeSeasons([]);
        setSelectedSeasonNumber(null);
        searchAnime(trimmed, 25).then((response) => {
          if (myRequest !== animeRequestId.current) return;
          if (response.success && response.results) {
            setAnimeResults(response.results);
            animeModeRef.current = true;
            setAnimeMode(true);
          } else {
            setAnimeResults([]);
            animeModeRef.current = true;
            setAnimeMode(true);
            if (response.error && response.error !== 'Empty query') {
              toast.error(t('animeEmpty'));
            }
          }
        }).catch(() => {
          if (myRequest !== animeRequestId.current) return;
          setAnimeResults([]);
        }).finally(() => {
          if (myRequest !== animeRequestId.current) return;
          setIsSearchingAnime(false);
        });
      }, 200);
      return () => window.clearTimeout(timeout);
    }

    // If we were in anime mode and the user toggled it off or changed the query
    // to no longer match, clear anime state so the badge hides.
    if (animeModeRef.current) {
      animeModeRef.current = false;
      setAnimeMode(false);
      setAnimeResults([]);
      setSelectedAnime(null);
      setAnimeThemes([]);
      setAnimeSeasons([]);
      setSelectedSeasonNumber(null);
    }

    if (trimmed === searchQuery) return;
    const timeout = window.setTimeout(() => {
      clearActiveCollection();
      performSearch(trimmed);
      refreshRecent();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query, searchQuery, performSearch, refreshRecent, animeSearchEnabled, handleDirectUrl, clearActiveCollection, t]);

  const activeSeason = useMemo(() => {
    if (animeSeasons.length <= 1 || selectedSeasonNumber === null) return null;
    return animeSeasons.find((s) => s.seasonNumber === selectedSeasonNumber) ?? null;
  }, [animeSeasons, selectedSeasonNumber]);

  const displayedAnimeThemes = useMemo(
    () => (activeSeason ? activeSeason.themes : animeThemes),
    [activeSeason, animeThemes],
  );

  const activeSeasonCover = activeSeason?.cover || selectedAnime?.cover || '';
  const showEmpty = !activeCollection && !isLoadingCollection && !query.trim() && searchResults.length === 0 && !isSearching;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`px-3 sm:px-8 max-w-5xl mx-auto flex flex-col ${
        showEmpty
          ? 'pt-1 sm:pt-3 justify-center'
          : 'pt-2 sm:pt-4 pb-3 sm:pb-6'
      }`}
    >
      <section className={`home-hero ${showEmpty ? 'home-hero-expanded' : ''} px-3.5 py-2.5 sm:p-5 mb-2 sm:mb-4`}>
        <div className="home-hero-orb home-hero-orb-one" aria-hidden="true" />
        <div className="home-hero-orb home-hero-orb-two" aria-hidden="true" />
        <div className="relative z-10 text-center">
          <h1 className="text-base sm:text-2xl md:text-3xl font-bold tracking-tight text-[#F5F5F0]">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-0.5 max-w-md text-[11px] sm:text-sm text-[#A0A09A]">
            {t('heroSubtitle')}
          </p>
        </div>

        <div className="home-search-shell relative z-10 mt-2 sm:mt-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85857E]" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            className="w-full pl-10 pr-10 py-2 sm:py-3.5 rounded-2xl bg-transparent text-xs sm:text-sm text-[#F5F5F0] placeholder:text-[#6E6E68] focus:outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {isSearching || isLoadingCollection ? (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C8F04B] animate-spin" />
          ) : query ? (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                animeBypassQueryRef.current = null;
                directUrlRequestId.current++;
                setQuery('');
                clearActiveCollection();
                clearSearch();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center transition-colors"
              aria-label={t('clearSearch')}
            >
              <X className="w-3 h-3 text-[#A0A09A]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#6E6E68] hover:text-[#C8F04B] hover:bg-white/[0.06] transition-colors"
              title={t('pasteFromClipboard')}
              aria-label={t('pasteLink')}
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {inputFocused && !query.trim() && recent.length > 0 && (
        <div className="mb-2 text-center sm:text-left">
          <p className="text-[9.5px] uppercase tracking-[0.2em] font-semibold text-[#8E8E88] mb-1">{t('recent')}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1">
            {recent.map((term) => (
              <button
                key={term}
                className="group flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.02] text-[#A0A098] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/35 hover:bg-[var(--accent-primary)]/5 transition-all shadow-sm"
                onClick={() => handleSuggestionClick(term)}
              >
                <span>{term}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); removeRecent(term); }}
                  className="text-[#666] hover:text-red-400 transition-colors p-0.5 rounded-full"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showEmpty && (
        <section className="artist-discovery mb-0 sm:mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2.5 px-0.5">
            <div className="text-left">
              <div className="inline-flex items-center gap-1.5 text-[9px] sm:text-[9.5px] uppercase tracking-[0.2em] text-[#A6C955] font-semibold">
                <Sparkles className="w-3 h-3" />
                {t('discoverArtists')}
              </div>
              <p className="mt-0.5 text-[9.5px] sm:text-[11px] text-[#8E8E88]">
                {t('artistPoolHint', { count: GLOBAL_ARTISTS_POOL.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={rotateArtistSuggestions}
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] sm:text-[11px] font-medium text-[#C8C8C0] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-all shadow-sm active:scale-95 flex-shrink-0"
            >
              <RefreshCw className="w-3 h-3 transition-transform duration-500 group-hover:rotate-180 text-[#A6C955]" />
              <span>{t('refreshArtists')}</span>
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1 sm:gap-2">
            {suggestedArtists.map((artist) => {
              const genre = artistGenre(artist.name);
              const genreLabel = genre ? t(`genre_${genre}`) : null;
              return (
                <motion.button
                  key={artist.name}
                  type="button"
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => handleSuggestionClick(artist.name)}
                  className="artist-showcase-card group relative flex flex-col items-center justify-center p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-white/[0.025] hover:bg-white/[0.055] border border-white/[0.06] text-center overflow-hidden min-h-[52px] sm:min-h-[76px]"
                >
                  <div
                    className="relative mb-0.5 w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-[10px] sm:text-xs font-black text-[#080808] transition-transform duration-200 group-hover:scale-105 shadow-md flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${artist.primary}, ${artist.secondary})`,
                      boxShadow: `0 3px 10px ${artist.glow}`,
                    }}
                  >
                    {artistMonogram(artist.name)}
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold text-[#F5F5F0] group-hover:text-[var(--accent-primary)] transition-colors truncate max-w-full px-0.5 leading-tight">
                    {artist.name}
                  </span>
                  {genreLabel && (
                    <span className="mt-0.5 text-[7px] sm:text-[8px] font-medium tracking-wide uppercase px-1 py-0.2 rounded bg-white/[0.04] text-[#8E8E88] group-hover:text-[#D8D8D0] group-hover:bg-white/[0.08] transition-colors truncate max-w-full">
                      {genreLabel}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>
      )}

      {!activeCollection && !isLoadingCollection && !animeMode && searchResults.length > 0 && !isSearching && (
        <p className="text-[11px] text-[#555] mb-3">
          {t('resultsFor', { count: searchResults.length, query: searchQuery })}
        </p>
      )}

      <AnimatePresence>
        {activeCollection ? (
          <CollectionPanel
            key={activeCollection.id}
            collection={activeCollection}
            onBack={clearActiveCollection}
            onDownloadAll={handleCollectionDownloadAll}
            onDownloadTrack={handleCollectionDownloadTrack}
            isTrackDownloaded={isDownloaded}
            isTrackDownloading={isTrackBusy}
          />
        ) : isLoadingCollection ? (
          <motion.div
            key="collection-loading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-5 flex items-center justify-center gap-2.5 text-xs text-[#A0A098]"
          >
            <Loader2 className="w-4 h-4 text-[#C8F04B] animate-spin" />
            <span>{t('resolvingCollection')}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!activeCollection && animeMode && (
          <motion.div
            key="anime-mode"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <AnimeModeBadge active onToggle={handleAnimeModeToggle} />
              {query.trim() && (
                <span className="text-[11px] text-[#555]">
                  {t('resultsFor', { count: animeResults.length, query: query.trim() })}
                </span>
              )}
            </div>

            {selectedAnime ? (
              <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-4 sm:p-5">
                <button
                  type="button"
                  onClick={handleBackToAnimeResults}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[#999] hover:text-[#C8F04B] transition-colors mb-3"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('search')}
                </button>
                <div className="flex gap-4 items-start">
                  {activeSeasonCover ? (
                    <img
                      src={activeSeasonCover}
                      alt=""
                      className="w-20 h-28 sm:w-28 sm:h-40 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-28 sm:w-28 sm:h-40 rounded-lg bg-[rgba(255,255,255,0.05)] flex items-center justify-center flex-shrink-0">
                      <Tv className="w-8 h-8 text-[#666660]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-[#F5F5F0] font-[family-name:Syne]">
                      {selectedAnime.titleEnglish || selectedAnime.titleRomaji}
                    </h2>
                    <p className="text-[11px] text-[#666660] mt-1">
                      {[
                        (activeSeason?.year ?? selectedAnime.year) != null
                          ? t('animeDetailYear', { year: (activeSeason?.year ?? selectedAnime.year)! })
                          : null,
                        t(`animeDetailType${selectedAnime.type}` as const),
                        (activeSeason?.episodes ?? selectedAnime.episodes) != null
                          ? t('animeDetailEpisodes', { n: (activeSeason?.episodes ?? selectedAnime.episodes)! })
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {selectedAnime.synopsis ? (
                      <p className="text-xs text-[#888] mt-2 line-clamp-4 sm:line-clamp-6">
                        {selectedAnime.synopsis}
                      </p>
                    ) : null}
                  </div>
                </div>

                {animeSeasons.length > 1 && (
                  <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
                    {animeSeasons.map((season) => {
                      const isActive = selectedSeasonNumber === season.seasonNumber;
                      return (
                        <button
                          key={season.anilistId}
                          type="button"
                          onClick={() => setSelectedSeasonNumber(season.seasonNumber)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                            isActive
                              ? 'bg-[#C8F04B] text-[#080808] font-semibold'
                              : 'bg-white/[0.04] text-[#A0A098] border border-[rgba(255,255,255,0.06)] hover:text-[#F5F5F0] hover:bg-white/[0.07]'
                          }`}
                        >
                          <span>{t('animeSeasonLabel', { n: season.seasonNumber })}</span>
                          {season.year != null && (
                            <span className={isActive ? 'text-[#080808]/70' : 'text-[#666660]'}>
                              · {season.year}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                              isActive
                                ? 'bg-[#080808]/15 text-[#080808]'
                                : 'bg-white/[0.06] text-[#8E8E88]'
                            }`}
                          >
                            {season.themes.length}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedSeasonNumber(null)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                        selectedSeasonNumber === null
                          ? 'bg-[#C8F04B] text-[#080808] font-semibold'
                          : 'bg-white/[0.04] text-[#A0A098] border border-[rgba(255,255,255,0.06)] hover:text-[#F5F5F0] hover:bg-white/[0.07]'
                      }`}
                    >
                      <span>{t('animeAllSeasons')}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          selectedSeasonNumber === null
                            ? 'bg-[#080808]/15 text-[#080808]'
                            : 'bg-white/[0.06] text-[#8E8E88]'
                        }`}
                      >
                        {animeThemes.length}
                      </span>
                    </button>
                  </div>
                )}

                {!isLoadingThemes && displayedAnimeThemes.length > 0 && (
                  <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                    {activeSeason ? (
                      <p className="text-xs text-[#A0A098] truncate">
                        {activeSeason.titleEnglish || activeSeason.titleRomaji}
                      </p>
                    ) : <span />}
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadSeason(
                          displayedAnimeThemes,
                          selectedAnime.titleEnglish || selectedAnime.titleRomaji,
                          activeSeasonCover,
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C8F04B] text-[#080808] hover:bg-[#d4f56a] active:scale-[0.98] text-[11px] font-semibold transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('animeDownloadSeason', { n: displayedAnimeThemes.length })}</span>
                    </button>
                  </div>
                )}

                <div className="mt-4 space-y-4">
                  {(['OP', 'ED'] as const).map((kind) => {
                    const section = displayedAnimeThemes.filter((th) => th.type === kind);
                    if (section.length === 0) return null;
                    return (
                      <div key={kind}>
                        <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#666660] mb-2">
                          {kind === 'OP' ? t('animeThemesOpening') : t('animeThemesEnding')}
                        </h3>
                        <div className="space-y-1.5">
                          {section.map((theme) => {
                            const key = `${theme.animeId}-${theme.type}-${theme.sequence}`;
                            const downloaded = downloads.some(
                              (d) => d.status === 'completed' && isAnimeThemeDownloadMatch(d.track, theme, key),
                            );
                            const downloading =
                              downloadingThemeKey === key
                              || downloads.some(
                                (d) =>
                                  (d.status === 'downloading' || d.status === 'queued')
                                  && isAnimeThemeDownloadMatch(d.track, theme, key),
                              );
                            const themeTitle = theme.seasonTitle || selectedAnime.titleEnglish || selectedAnime.titleRomaji;
                            const themeCover = seasonCoverMap.get(theme.animeId) || activeSeasonCover;
                            return (
                              <ThemeRow
                                key={key}
                                theme={theme}
                                animeTitle={themeTitle}
                                onDownload={() => handleThemeDownload(theme, themeTitle, themeCover)}
                                downloading={downloading}
                                downloaded={downloaded}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {isLoadingThemes && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 text-[#C8F04B] animate-spin" />
                    </div>
                  )}

                  {!isLoadingThemes && displayedAnimeThemes.length === 0 && (
                    <p className="text-xs text-[#666660] text-center py-4">{t('animeEmpty')}</p>
                  )}
                </div>
              </div>
            ) : isSearchingAnime ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse aspect-square"
                  />
                ))}
              </div>
            ) : animeResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {animeResults.map((anime) => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    onClick={() => handleAnimeCardClick(anime)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-[#666660] py-8">
                {t('animeEmpty')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!activeCollection && !isLoadingCollection && !animeMode && searchResults.length > 0 ? (
          <motion.div key="results-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              key="results-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="hidden sm:grid gap-4"
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              {searchResults.map((track, i) => {
                const isCurrent = currentTrack?.id === track.id;
                const downloading = isDownloading(track.id);
                const downloaded = isDownloaded(track.id);
                const bestCandidate = bestCandidates[candidateTrackKey(track)];
                const bestResolving = bestResolvingId === candidateTrackKey(track);
                const resolutionState = resolutionStates[candidateTrackKey(track)];
                const isFeatured = i === 0 && searchResults.length >= 4;

                return (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceResultMotion ? 0 : Math.min(i, 6) * 0.035 }}
                    className={`group cursor-pointer rounded-xl overflow-hidden bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.05)] transition-all ${
                      isFeatured ? 'col-span-2 row-span-2' : ''
                    }`}
                    onClick={() => playTrack(track)}
                  >
                    <div className="relative aspect-square overflow-hidden">
                      {track.cover ? (
                        <img
                          src={track.cover}
                          alt=""
                          loading={i === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#C8F04B]/20 to-[#8BC34A]/10 flex items-center justify-center">
                          <Music className={`text-[#666660] ${isFeatured ? 'w-12 h-12' : 'w-8 h-8'}`} />
                        </div>
                      )}
                      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${
                        isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <div className="w-10 h-10 rounded-full bg-[#C8F04B] flex items-center justify-center">
                          {isCurrent && isPlaying ? (
                            <Pause className="w-5 h-5 text-[#080808] fill-current" />
                          ) : (
                            <Play className="w-5 h-5 text-[#080808] fill-current ml-0.5" />
                          )}
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {track.albumId != null && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenAlbum(track.albumId!);
                              }}
                              className="p-2 rounded-lg bg-black/60 text-[#A0A098] hover:text-[#C8F04B] hover:bg-black/80 transition-colors shadow-md flex items-center justify-center"
                              aria-label={t('viewAlbum')}
                              title={t('viewAlbum')}
                            >
                              <Disc3 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              if (downloading || downloaded) return;
                              if (track.sourceUrl && !bestCandidate) {
                                startDownloadWithSourceUrl(track, track.sourceUrl);
                                return;
                              }
                              if (isNativeProduct && bestCandidate) {
                                void handleBestDownloadClick(e, track);
                              } else {
                                handleDownloadClick(e, track);
                              }
                            }}
                            onMouseEnter={() => { if (!downloading && !downloaded) handleDownloadPrefetch(track); }}
                            onTouchStart={() => { if (!downloading && !downloaded) handleDownloadPrefetch(track); }}
                            disabled={downloading || bestResolving}
                            className={`p-2 rounded-lg transition-all shadow-md flex items-center justify-center ${
                              downloading
                                ? 'bg-black/60 text-[#C8F04B]'
                                : downloaded
                                  ? 'bg-[#C8F04B]/20 text-[#C8F04B]'
                                  : isNativeProduct && bestCandidate
                                    ? 'bg-[#C8F04B] text-[#18181A] hover:bg-[#d4f56a] hover:scale-105'
                                    : 'bg-black/60 text-white hover:bg-black/80'
                            }`}
                            title={downloaded ? t('downloadComplete') : isNativeProduct && bestCandidate ? t('downloadBestMatch') : t('downloadMp3')}
                          >
                            {downloading || bestResolving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : downloaded ? (
                              <CheckCircle className="w-4 h-4 text-[#C8F04B]" />
                            ) : isNativeProduct && bestCandidate ? (
                              <Zap className="w-4 h-4 fill-current" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                          {isNativeProduct && !downloaded && !downloading && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPickerTrack(track); }}
                              className="p-1.5 rounded-lg bg-black/40 text-[#8E8E88] hover:text-white hover:bg-black/70 transition-colors"
                              title={t('chooseExactSong')}
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <span className="absolute bottom-1.5 right-1.5 text-[10px] tabular-nums bg-black/70 text-white px-1.5 py-0.5 rounded">
                        {formatDuration(track.duration)}
                      </span>
                      {downloaded && (
                        <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <CheckCircle className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className={`text-sm font-medium truncate ${isCurrent ? 'text-[#C8F04B]' : 'text-[#F5F5F0]'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-[#666660] truncate">{track.artist}</p>
                      {resolutionState && (
                        <p className={`text-[10px] mt-1 ${resolutionState === 'verified' ? 'text-[#C8F04B]' : 'text-[#777]'}`}>
                          {t(`candidateState${resolutionState[0].toUpperCase()}${resolutionState.slice(1)}`)}
                        </p>
                      )}
                      {isFeatured && <p className="text-xs text-[#555] mt-1 truncate">{track.album}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            <motion.div
              key="results-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sm:hidden space-y-1"
            >
              {searchResults.map((track, i) => {
                const isCurrent = currentTrack?.id === track.id;
                const downloading = isDownloading(track.id);
                const downloaded = isDownloaded(track.id);
                const bestCandidate = bestCandidates[candidateTrackKey(track)];
                const bestResolving = bestResolvingId === candidateTrackKey(track);
                const resolutionState = resolutionStates[candidateTrackKey(track)];

                return (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceResultMotion ? 0 : Math.min(i, 6) * 0.02 }}
                    className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors group ${
                      isCurrent ? 'bg-[rgba(200,240,75,0.08)]' : 'hover:bg-[rgba(255,255,255,0.04)] active:bg-[rgba(255,255,255,0.06)]'
                    }`}
                    onClick={() => playTrack(track)}
                  >
                    <div className="relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0">
                      {track.cover ? (
                        <img
                          src={track.cover}
                          alt=""
                          loading={i === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#C8F04B]/20 to-[#8BC34A]/10 flex items-center justify-center">
                          <Music className="w-5 h-5 text-[#666660]" />
                        </div>
                      )}
                      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                        isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        {isCurrent && isPlaying ? (
                          <Pause className="w-4 h-4 text-white fill-white" />
                        ) : (
                          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                        )}
                      </div>
                      {downloaded && (
                        <span className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                          <CheckCircle className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${isCurrent ? 'text-[#C8F04B]' : 'text-[#F5F5F0]'}`}>
                        {track.title}
                      </p>
                      <p className="text-[11px] text-[#666660] truncate">{track.artist}</p>
                      {resolutionState && (
                        <p className={`text-[9px] ${resolutionState === 'verified' ? 'text-[#C8F04B]' : 'text-[#777]'}`}>
                          {t(`candidateState${resolutionState[0].toUpperCase()}${resolutionState.slice(1)}`)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-[#444] tabular-nums flex-shrink-0">
                      {formatDuration(track.duration)}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {track.albumId != null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenAlbum(track.albumId!);
                          }}
                          className="p-2 rounded-xl text-[#8E8E88] hover:text-[#C8F04B] active:text-[#C8F04B] bg-white/[0.04] transition-colors flex items-center justify-center min-w-[38px] min-h-[38px]"
                          aria-label={t('viewAlbum')}
                          title={t('viewAlbum')}
                        >
                          <Disc3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          if (downloading || downloaded) return;
                          if (track.sourceUrl && !bestCandidate) {
                            startDownloadWithSourceUrl(track, track.sourceUrl);
                            return;
                          }
                          if (isNativeProduct && bestCandidate) {
                            void handleBestDownloadClick(e, track);
                          } else {
                            handleDownloadClick(e, track);
                          }
                        }}
                        onMouseEnter={() => { if (!downloading && !downloaded) handleDownloadPrefetch(track); }}
                        onTouchStart={() => { if (!downloading && !downloaded) handleDownloadPrefetch(track); }}
                        disabled={downloading || bestResolving}
                        className={`p-2.5 rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center shadow-sm active:scale-95 ${
                          downloading
                            ? 'text-[#C8F04B] cursor-wait bg-white/[0.04]'
                            : downloaded
                              ? 'text-[#C8F04B] bg-[#C8F04B]/10'
                              : isNativeProduct && bestCandidate
                                ? 'bg-[#C8F04B] text-[#18181A] active:bg-[#d4f56a]'
                                : 'text-[#8E8E88] hover:text-[#C8F04B] active:text-[#C8F04B] bg-white/[0.04]'
                        }`}
                        title={downloaded ? t('downloadComplete') : isNativeProduct && bestCandidate ? t('downloadBestMatch') : t('downloadMp3')}
                      >
                        {downloading || bestResolving ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : downloaded ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : isNativeProduct && bestCandidate ? (
                          <Zap className="w-5 h-5 fill-current" />
                        ) : (
                          <Download className="w-5 h-5" />
                        )}
                      </button>
                      {isNativeProduct && !downloaded && !downloading && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPickerTrack(track); }}
                          className="p-2 rounded-xl text-[#70706B] hover:text-[#F5F5F0] transition-colors"
                          title={t('chooseExactSong')}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            <div ref={loadMoreRef} className="py-6 flex justify-center">
              {isLoadingMore && (
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-20 h-24 sm:w-32 sm:h-40 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
              {!hasMoreResults && searchResults.length > 0 && (
                <p className="text-xs text-[#555]">{t('noMoreResults')}</p>
              )}
            </div>
          </motion.div>
        ) : !activeCollection && !isLoadingCollection && !animeMode && !isSearching && query.trim() ? (
          <motion.p
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-[#9E9E98] py-12"
          >
            {t('noResults')}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pickerTrack && (
          <CandidatePicker
            track={pickerTrack}
            animeSearchEnabled={animeSearchEnabled}
            editionPreference={editionPreference}
            onClose={() => setPickerTrack(null)}
            onSelect={(videoId) => {
              startDownloadWithVideoId(pickerTrack, videoId);
              setPickerTrack(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
