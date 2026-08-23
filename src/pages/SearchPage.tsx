import { useShallow } from 'zustand/react/shallow';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Download, Play, Pause, Search, Loader2, Music, CheckCircle, X, ArrowLeft, Tv, Zap, RefreshCw, Sparkles } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { getDownloadCandidates, type DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';
import { GLOBAL_ARTISTS_POOL, buildAffinityPool, buildArtistVisuals, artistGenre } from '@/data/globalArtists';
import { useI18n } from '@/lib/useI18n';
import { CandidatePicker } from '@/components/ui/CandidatePicker';
import { AnimeCard } from '@/components/ui/AnimeCard';
import { ThemeRow } from '@/components/ui/ThemeRow';
import { AnimeModeBadge } from '@/components/ui/AnimeModeBadge';
import { searchAnime, getAnimeThemes, downloadAnimeTheme } from '@/lib/api/animeApi';
import { looksAnimeLikeQuery } from '@/lib/util/animeDetector';
import type { Anime, AnimeTheme } from '@/types/anime';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { canDownloadWithOneTap } from '@/lib/download/candidateResolver';
import { CandidateScheduler } from '@/lib/download/candidateScheduler';
import { isDirectMediaUrl, isUnsupportedCollectionUrl, resolveTrackFromUrl } from '@/lib/music/urlResolver';

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
    startDownload,
    startDownloadWithVideoId,
    startDownloadWithSourceUrl,
    downloads,
    mostDownloadedArtists,
    animeSearchEnabled,
    autoCandidateResolution,
    resolutionProfile,
    cellularResolutionPolicy,
    editionPreference,
    autoDownload,
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
    startDownload: s.startDownload,
    startDownloadWithVideoId: s.startDownloadWithVideoId,
    startDownloadWithSourceUrl: s.startDownloadWithSourceUrl,
    downloads: s.downloads,
    mostDownloadedArtists: s.mostDownloadedArtists,
    animeSearchEnabled: s.animeSearchEnabled,
    autoCandidateResolution: s.autoCandidateResolution,
    resolutionProfile: s.resolutionProfile,
    cellularResolutionPolicy: s.cellularResolutionPolicy,
    editionPreference: s.editionPreference,
    autoDownload: s.autoDownload,
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
  const [animeResults, setAnimeResults] = useState<Anime[]>([]);
  const [isSearchingAnime, setIsSearchingAnime] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [animeThemes, setAnimeThemes] = useState<AnimeTheme[]>([]);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [downloadingThemeKey, setDownloadingThemeKey] = useState<string | null>(null);
  const animeRequestId = useRef(0);
  const themesRequestId = useRef(0);

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
    setIsLoadingThemes(true);
    const response = await getAnimeThemes(anime.id);
    if (requestId !== themesRequestId.current) return;
    setIsLoadingThemes(false);
    if (response.success && response.themes) {
      setAnimeThemes(response.themes);
    } else {
      setAnimeThemes([]);
      const errMsg = response.error ?? 'Unknown themes fetch error';
      toast.error(errMsg);
    }
  }, []);

  const handleAnimeModeToggle = useCallback(() => {
    const trimmed = query.trim();
    setAnimeMode(false);
    setAnimeResults([]);
    setSelectedAnime(null);
    setAnimeThemes([]);
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
  }, []);

  const handleThemeDownload = useCallback(
    (theme: AnimeTheme, animeTitle: string) => {
      const key = `${theme.animeId}-${theme.type}-${theme.sequence}`;
      if (downloadingThemeKey === key) return;
      setDownloadingThemeKey(key);
      downloadAnimeTheme(theme, animeTitle, selectedAnime?.cover ?? '')
        .then((response) => {
          if (response.success && response.sourceUrl && response.track) {
            startDownloadWithSourceUrl(response.track, response.sourceUrl);
            toast.success(`${animeTitle} ${theme.type} ${theme.sequence}`);
          } else if (response.candidates && response.candidates.length > 0) {
            toast(t('animeThemesDeadVideo'));
            if (response.track) setPickerTrack(response.track);
          } else {
            toast.error(response.error ?? 'Download failed');
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Download failed';
          toast.error(message);
        })
        .finally(() => {
          setDownloadingThemeKey((current) => (current === key ? null : current));
        });
    },
    [downloadingThemeKey, selectedAnime?.cover, startDownloadWithSourceUrl, t],
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

  const handleDirectUrl = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed || isSearching) return;

    if (isUnsupportedCollectionUrl(trimmed)) {
      toast.error('Pega el enlace de una canción o pista individual', { id: 'url-resolve' });
      return;
    }

    setIsSearching(true);
    toast.loading(t('resolvingUrl'), { id: 'url-resolve' });
    try {
      const resolvedTrack = await resolveTrackFromUrl(trimmed);
      if (resolvedTrack) {
        toast.success(
          t('urlResolved', { title: resolvedTrack.title, artist: resolvedTrack.artist }),
          { id: 'url-resolve' }
        );
        setSearchResults([resolvedTrack]);
        setSearchQuery(resolvedTrack.title);
        if (autoDownload) {
          startDownload(resolvedTrack);
        }
      } else {
        toast.error(t('noResults'), { id: 'url-resolve' });
      }
    } catch {
      toast.error(t('noResults'), { id: 'url-resolve' });
    } finally {
      setIsSearching(false);
    }
  }, [autoDownload, isSearching, startDownload, t]);

  const handleSearch = () => {
    const sanitized = query.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (!sanitized || isSearching) return;
    
    if (isDirectMediaUrl(sanitized)) {
      handleDirectUrl(sanitized);
      return;
    }
    
    performSearch(sanitized);
    refreshRecent();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSuggestionClick = (term: string) => {
    setQuery(term);
    performSearch(term);
    refreshRecent();
  };

  const rotateArtistSuggestions = () => {
    setArtistExclusions((current) => [...current, ...suggestedSearches].slice(-300));
    setArtistRotation((current) => current + 1);
  };

  const isDownloading = (trackId: string) =>
    downloads.some((d) => d.track.id === trackId && d.status === 'downloading');

  const isDownloaded = (trackId: string) =>
    downloads.some((d) => d.track.id === trackId && d.status === 'completed');

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
  }, [autoDownload, animeMode, bestCandidates, downloads, isNativeProduct, resolutionStates, searchQuery, searchResults, startDownloadWithVideoId, t]);

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
      animeRequestId.current++;
      themesRequestId.current++;
      setAnimeMode(false);
      setAnimeResults([]);
      setSelectedAnime(null);
      setAnimeThemes([]);
      setIsSearchingAnime(false);
      setIsLoadingThemes(false);
      if (searchQuery) {
        const timeout = window.setTimeout(() => {
          performSearch('');
        }, 150);
        return () => window.clearTimeout(timeout);
      }
      return;
    }
    if (trimmed.length < 2) return;

    // Anime mode (opt-in): if the toggle is on and the query smells like anime,
    // call searchAnime() and render the anime grid instead of the songs grid.
    if (animeSearchEnabled && looksAnimeLikeQuery(trimmed)) {
      const myRequest = ++animeRequestId.current;
      const timeout = window.setTimeout(() => {
        if (myRequest !== animeRequestId.current) return;
        setIsSearchingAnime(true);
        setSelectedAnime(null);
        setAnimeThemes([]);
        searchAnime(trimmed, 25).then((response) => {
          if (myRequest !== animeRequestId.current) return;
          if (response.success && response.results) {
            setAnimeResults(response.results);
            setAnimeMode(true);
          } else {
            setAnimeResults([]);
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
    if (animeMode) {
      setAnimeMode(false);
      setAnimeResults([]);
      setSelectedAnime(null);
      setAnimeThemes([]);
    }

    if (trimmed === searchQuery) return;
    const timeout = window.setTimeout(() => {
      if (isDirectMediaUrl(trimmed)) {
        handleDirectUrl(trimmed);
        return;
      }
      performSearch(trimmed);
      refreshRecent();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query, searchQuery, performSearch, refreshRecent, animeSearchEnabled, animeMode, handleDirectUrl]);

  const showEmpty = !query.trim() && searchResults.length === 0 && !isSearching;

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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            className="w-full pl-10 pr-10 py-2 sm:py-3.5 rounded-2xl bg-transparent text-xs sm:text-sm text-[#F5F5F0] placeholder:text-[#6E6E68] focus:outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {isSearching ? (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C8F04B] animate-spin" />
          ) : query ? (
            <button
              onMouseDown={(e) => { e.preventDefault(); setQuery(''); performSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center transition-colors"
              aria-label={t('clearSearch')}
            >
              <X className="w-3 h-3 text-[#A0A09A]" />
            </button>
          ) : null}
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

      {searchResults.length > 0 && !isSearching && (
        <p className="text-[11px] text-[#555] mb-3">
          {t('resultsFor', { count: searchResults.length, query: searchQuery })}
        </p>
      )}

      <AnimatePresence>
        {animeMode && (
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
                  {selectedAnime.cover ? (
                    <img
                      src={selectedAnime.cover}
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
                        selectedAnime.year != null ? t('animeDetailYear', { year: selectedAnime.year }) : null,
                        t(`animeDetailType${selectedAnime.type}` as const),
                        selectedAnime.episodes != null
                          ? t('animeDetailEpisodes', { n: selectedAnime.episodes })
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

                <div className="mt-5 space-y-4">
                  {(['OP', 'ED'] as const).map((kind) => {
                    const section = animeThemes.filter((th) => th.type === kind);
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
                              (d) => d.track.id === `anime-${key}` && d.status === 'completed',
                            );
                            return (
                              <ThemeRow
                                key={key}
                                theme={theme}
                                animeTitle={selectedAnime.titleEnglish || selectedAnime.titleRomaji}
                                onDownload={() => handleThemeDownload(theme, selectedAnime.titleEnglish || selectedAnime.titleRomaji)}
                                downloading={downloadingThemeKey === key}
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

                  {!isLoadingThemes && animeThemes.length === 0 && (
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
        {!animeMode && searchResults.length > 0 ? (
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
                          <button
                            onClick={(e) => {
                              if (downloading || downloaded) return;
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
                      <button
                        onClick={(e) => {
                          if (downloading || downloaded) return;
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
        ) : !isSearching && query.trim() ? (
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
