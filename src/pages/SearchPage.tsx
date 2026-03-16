import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Play, Pause, Search, Loader2, Music, CheckCircle, X } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';

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
    startDownload,
    downloads,
  } = useMusicStore();

  const [query, setQuery] = useState(searchQuery);
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

  // Infinite scroll observer
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

  const showEmpty = !query.trim() && searchResults.length === 0 && !isSearching;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="mb-5 sm:mb-8 text-center">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight font-[family-name:Syne] text-[#F5F5F0]">
          MHL Music
        </h1>
        <p className="text-[11px] sm:text-sm text-[#666660] mt-0.5">Tu música. Sin límites.</p>
      </div>

      {/* Search Input */}
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

      {/* Recent Searches — only when input focused, empty query, and we have recent */}
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

      {/* Suggestion Pills — only when no query and no results */}
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

      {/* Result counter */}
      {searchResults.length > 0 && !isSearching && (
        <p className="text-[11px] text-[#555] mb-3">
          {searchResults.length} canciones encontradas para &apos;{searchQuery}&apos;
        </p>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {searchResults.length > 0 ? (
          <>
            {/* Desktop Grid */}
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
                          onClick={(e) => { e.stopPropagation(); if (!downloading) startDownload(track); }}
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

            {/* Mobile List */}
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
                      onClick={(e) => { e.stopPropagation(); if (!downloading) startDownload(track); }}
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

            {/* Infinite scroll sentinel */}
            <div ref={loadMoreRef} className="py-6 flex justify-center">
              {isLoadingMore && (
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-20 h-24 sm:w-32 sm:h-40 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
              {!hasMoreResults && searchResults.length > 0 && (
                <p className="text-xs text-[#555]">No hay más resultados</p>
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
            <p className="text-sm text-[#666660]">Escribe el nombre de una canción o artista</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
