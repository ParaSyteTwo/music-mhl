import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Play, Pause, Search, Loader2, Music, CheckCircle, X, Clock } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { getDownloadCandidates, type DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';
import { Capacitor } from '@capacitor/core';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SUGGESTED_SEARCHES = ['Bad Bunny', 'Daft Punk', 'Taylor Swift', 'Peso Pluma', 'The Weeknd'];

function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]'); } catch { return []; }
  });
  const remove = (term: string) => {
    const updated = recent.filter((s) => s !== term);
    setRecent(updated);
    localStorage.setItem('mhl-recent-searches', JSON.stringify(updated));
  };
  const refresh = () => {
    try { setRecent(JSON.parse(localStorage.getItem('mhl-recent-searches') || '[]')); } catch { /* */ }
  };
  return { recent, remove, refresh };
}

export default function SearchPage() {
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
    downloads,
  } = useMusicStore();

  const [query, setQuery] = useState(searchQuery);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);

  const handleDownloadClick = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (isDownloading(track.id)) return;
    setPickerTrack(track);
  };

  const handleDownloadPrefetch = useCallback((track: Track) => {
    getDownloadCandidates(track).catch(() => {});
  }, []);
  const [inputFocused, setInputFocused] = useState(false);
  const { recent, remove: removeRecent, refresh: refreshRecent } = useRecentSearches();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    if (query.trim()) {
      performSearch(query);
      refreshRecent();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSuggestionClick = (term: string) => {
    setQuery(term);
    performSearch(term);
    refreshRecent();
  };

  const isDownloading = (trackId: string) =>
    downloads.some((d) => d.track.id === trackId && d.status === 'downloading');

  const isDownloaded = (trackId: string) =>
    downloads.some((d) => d.track.id === trackId && d.status === 'completed');

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
      if (searchQuery) {
        const timeout = window.setTimeout(() => {
          performSearch('');
        }, 150);
        return () => window.clearTimeout(timeout);
      }
      return;
    }
    if (trimmed.length < 2 || trimmed === searchQuery) return;
    const timeout = window.setTimeout(() => {
      performSearch(trimmed);
      refreshRecent();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query, searchQuery, performSearch, refreshRecent]);

  const showEmpty = !query.trim() && searchResults.length === 0 && !isSearching;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-5xl mx-auto"
    >
      <div className="mb-5 sm:mb-8 text-center">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight font-[family-name:Syne] text-[#F5F5F0]">
          MHL Music
        </h1>
        <p className="text-[11px] sm:text-sm text-[#666660] mt-0.5">Tu musica. Sin limites.</p>
      </div>

      <div className="relative mb-3 sm:mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666660]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setTimeout(() => setInputFocused(false), 200)}
          placeholder="Buscar canciones, artistas..."
          className="w-full pl-10 pr-12 py-3 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] text-sm text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[#C8F04B] focus:shadow-[0_0_0_3px_rgba(200,240,75,0.15)] transition-all"
        />
        {isSearching ? (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C8F04B] animate-spin" />
        ) : (
          <button
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#666660] hover:text-[#C8F04B] hover:bg-[rgba(200,240,75,0.1)] transition-colors"
            aria-label="Buscar"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      {inputFocused && !query.trim() && recent.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-[#555] mb-2">Recientes</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((term) => (
              <button
                key={term}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[rgba(255,255,255,0.1)] text-[#999] hover:text-[#C8F04B] hover:border-[#C8F04B]/30 hover:bg-[rgba(200,240,75,0.05)] transition-all"
                onClick={() => handleSuggestionClick(term)}
              >
                {term}
                <span
                  onClick={(e) => { e.stopPropagation(); removeRecent(term); }}
                  className="text-[#555] hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-widest text-[#555] mb-2 text-center">Prueba con:</p>
          <div className="flex justify-center flex-wrap gap-2">
            {SUGGESTED_SEARCHES.map((term) => (
              <button
                key={term}
                onClick={() => handleSuggestionClick(term)}
                className="px-4 py-1.5 rounded-full text-xs font-medium border border-[rgba(255,255,255,0.1)] text-[#999] hover:text-[#C8F04B] hover:border-[#C8F04B]/30 hover:bg-[rgba(200,240,75,0.05)] transition-all"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {searchResults.length > 0 && !isSearching && (
        <p className="text-[11px] text-[#555] mb-3">
          {searchResults.length} canciones encontradas para &apos;{searchQuery}&apos;
        </p>
      )}

      <AnimatePresence mode="wait">
        {searchResults.length > 0 ? (
          <>
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
                const isFeatured = i === 0 && searchResults.length >= 4;

                return (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.05 }}
                    className={`group cursor-pointer rounded-xl overflow-hidden bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.05)] transition-all ${
                      isFeatured ? 'col-span-2 row-span-2' : ''
                    }`}
                    onClick={() => playTrack(track)}
                  >
                    <div className="relative aspect-square overflow-hidden">
                      {track.cover ? (
                        <img src={track.cover} alt="" className="w-full h-full object-cover" />
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
                        <button
                          onClick={(e) => { if (!downloading) handleDownloadClick(e, track); }}
                          onMouseEnter={() => { if (!downloading) handleDownloadPrefetch(track); }}
                          onTouchStart={() => { if (!downloading) handleDownloadPrefetch(track); }}
                          disabled={downloading}
                          className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                          title="Descargar MP3"
                        >
                          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : downloaded ? <CheckCircle className="w-4 h-4 text-[#C8F04B]" /> : <Download className="w-4 h-4" />}
                        </button>
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

                return (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                    className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors group ${
                      isCurrent ? 'bg-[rgba(200,240,75,0.08)]' : 'hover:bg-[rgba(255,255,255,0.04)] active:bg-[rgba(255,255,255,0.06)]'
                    }`}
                    onClick={() => playTrack(track)}
                  >
                    <div className="relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0">
                      {track.cover ? (
                        <img src={track.cover} alt="" className="w-full h-full object-cover" />
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
                    </div>
                    <span className="text-[10px] text-[#444] tabular-nums flex-shrink-0">
                      {formatDuration(track.duration)}
                    </span>
                    <button
                      onClick={(e) => { if (!downloading) handleDownloadClick(e, track); }}
                      onMouseEnter={() => { if (!downloading) handleDownloadPrefetch(track); }}
                      onTouchStart={() => { if (!downloading) handleDownloadPrefetch(track); }}
                      disabled={downloading}
                      className={`p-2.5 -mr-1 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                        downloading ? 'text-[#C8F04B] cursor-wait' : downloaded ? 'text-[#C8F04B]' : 'text-[#666660] hover:text-[#C8F04B] active:text-[#C8F04B] hover:bg-[rgba(200,240,75,0.1)]'
                      }`}
                      title="Descargar MP3"
                    >
                      {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : downloaded ? <CheckCircle className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                    </button>
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
                <p className="text-xs text-[#555]">No hay mas resultados</p>
              )}
            </div>
          </>
        ) : !isSearching && query.trim() ? (
          <motion.p
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-[#666660] py-12"
          >
            No se encontraron resultados
          </motion.p>
        ) : showEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 sm:py-16 space-y-3"
          >
            <Music className="w-16 h-16 text-[#333] mx-auto animate-pulse" />
            <p className="text-sm text-[#666660]">Escribe el nombre de una cancion o artista</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pickerTrack && (
          <CandidatePicker
            track={pickerTrack}
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

function CandidatePicker({
  track,
  onClose,
  onSelect,
}: {
  track: Track;
  onClose: () => void;
  onSelect: (videoId: string) => void;
}) {
  const [candidates, setCandidates] = useState<DownloadCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isNativeMobile = Capacitor.isNativePlatform();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    console.log('[CandidatePicker] Fetching candidates for:', track.title);
    getDownloadCandidates(track)
      .then((cands) => {
        console.log('[CandidatePicker] Got candidates:', cands);
        setCandidates(cands);
        if (cands.length === 0) {
          toast.warning('No se encontraron candidatos de descarga');
          setError('Sin resultados');
        }
      })
      .catch((e) => {
        const errorMsg = e instanceof Error ? e.message : 'Error buscando candidatos';
        console.error('[CandidatePicker] Error:', e, errorMsg);
        toast.error(errorMsg);
        setError(errorMsg);
      })
      .finally(() => setLoading(false));
  }, [track]);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 z-[80] flex justify-center ${isNativeMobile ? 'items-start p-2 pt-3' : 'items-end sm:items-center p-0 sm:p-4'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full sm:max-w-lg flex flex-col bg-[#111] border border-[rgba(255,255,255,0.08)] overflow-hidden shadow-2xl ${isNativeMobile ? 'max-h-[92vh] min-h-[48vh] rounded-2xl' : 'max-h-[88vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl'}`}
      >
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0" style={{ paddingTop: 'calc(var(--sat) + 12px)' }}>
          {track.cover && (
            <img src={track.cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#F5F5F0] truncate">{track.title}</p>
            <p className="text-xs text-[#555] truncate">{track.artist}</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4 text-[#888]" />
          </motion.button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
          <div>
            <p className="text-xs font-medium text-[#F5F5F0]">Resultados inteligentes</p>
            <p className="text-[11px] text-[#555]">Busqueda rapida ordenada por coincidencia</p>
          </div>
          <span className="text-[10px] text-[#444] text-right">Elige la cancion exacta a descargar</span>
        </div>

        <div className="overflow-y-auto flex-1 px-3 pb-4 overscroll-contain">
          {loading ? (
            <div className="space-y-2 mt-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-[rgba(255,255,255,0.04)] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : error ? (
            <p className="text-center text-xs text-red-400 py-8">{error}</p>
          ) : candidates.length === 0 ? (
            <p className="text-center text-xs text-[#555] py-8">No se encontraron resultados</p>
          ) : (
            <div className="space-y-1.5 mt-1">
              {candidates.map((c, i) => {
                const durationMatch = track.duration > 0 && c.duration > 0
                  ? Math.abs(c.duration - track.duration) / track.duration
                  : 1;
                const isClose = durationMatch <= 0.15;
                const isBest = i === 0;
                const confidenceClass = c.confidence === 'alta'
                  ? 'bg-[rgba(200,240,75,0.15)] text-[#C8F04B]'
                  : c.confidence === 'media'
                    ? 'bg-[rgba(255,255,255,0.08)] text-[#D5D5CE]'
                    : 'bg-[rgba(255,255,255,0.06)] text-[#777]';

                return (
                  <motion.button
                    key={c.videoId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => onSelect(c.videoId)}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center gap-3 group transition-all ${
                      isBest
                        ? 'bg-[rgba(200,240,75,0.07)] border border-[rgba(200,240,75,0.2)] hover:bg-[rgba(200,240,75,0.12)]'
                        : 'bg-[rgba(255,255,255,0.03)] border border-transparent hover:bg-[rgba(255,255,255,0.07)]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#F5F5F0] leading-tight line-clamp-2">{c.title}</p>
                      <p className="text-[11px] text-[#555] truncate mt-0.5">{c.channel}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {c.label && (
                          <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#A9A99F]">
                            {c.label}
                          </span>
                        )}
                        {c.confidence && (
                          <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${confidenceClass}`}>
                            confianza {c.confidence}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {c.duration > 0 && (
                        <span className={`flex items-center gap-1 text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                          isClose
                            ? 'bg-[rgba(200,240,75,0.15)] text-[#C8F04B]'
                            : 'bg-[rgba(255,255,255,0.06)] text-[#555]'
                        }`}>
                          <Clock className="w-2.5 h-2.5" />
                          {fmt(c.duration)}
                        </span>
                      )}
                      {isBest && (
                        <span className="text-[9px] text-[#C8F04B] font-medium">mejor match</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
