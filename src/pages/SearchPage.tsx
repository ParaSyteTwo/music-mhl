import { useState, useRef, useEffect } from 'react';
import { Download, Play, Pause, Search, Loader2, Music } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SearchPage() {
  const {
    searchQuery,
    searchResults,
    isSearching,
    performSearch,
    playTrack,
    currentTrack,
    isPlaying,
    startDownload,
    downloads,
  } = useMusicStore();

  const [query, setQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim()) performSearch(query);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const isDownloading = (trackId: string) =>
    downloads.some((d) => d.track.id === trackId && d.status === 'downloading');

  return (
    <div className="px-3 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5 sm:mb-8 text-center">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight font-[family-name:Syne] text-[#F5F5F0]">
          MHL Music
        </h1>
        <p className="text-[11px] sm:text-sm text-[#666660] mt-0.5">Busca, escucha y descarga</p>
      </div>

      {/* Search Input */}
      <div className="relative mb-5 sm:mb-8">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666660]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canciones, artistas..."
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] text-sm text-[#F5F5F0] placeholder:text-[#444] focus:outline-none focus:border-[#C8F04B]/40 transition-colors"
          autoFocus
        />
        {isSearching && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C8F04B] animate-spin" />
        )}
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {searchResults.length > 0 ? (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-1"
          >
            {searchResults.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              const downloading = isDownloading(track.id);

              return (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`flex items-center gap-2.5 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg transition-colors group ${
                    isCurrent ? 'bg-[rgba(200,240,75,0.08)]' : 'hover:bg-[rgba(255,255,255,0.04)] active:bg-[rgba(255,255,255,0.06)]'
                  }`}
                >
                  {/* Cover + Play indicator */}
                  <button
                    onClick={() => playTrack(track)}
                    className="relative w-11 h-11 sm:w-10 sm:h-10 rounded-md overflow-hidden flex-shrink-0"
                  >
                    {track.cover ? (
                      <img src={track.cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#C8F04B]/20 to-[#8BC34A]/10 flex items-center justify-center">
                        <Music className="w-4 h-4 text-[#666660]" />
                      </div>
                    )}
                    {/* Always show play state on current track, hover on others */}
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                      isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      {isCurrent && isPlaying ? (
                        <Pause className="w-4 h-4 text-white fill-white" />
                      ) : (
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </button>

                  {/* Track info */}
                  <div className="flex-1 min-w-0" onClick={() => playTrack(track)} role="button">
                    <p className={`text-[13px] sm:text-sm font-medium truncate ${isCurrent ? 'text-[#C8F04B]' : 'text-[#F5F5F0]'}`}>
                      {track.title}
                    </p>
                    <p className="text-[11px] sm:text-xs text-[#666660] truncate">{track.artist}</p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-[#444] tabular-nums hidden sm:block">
                    {formatDuration(track.duration)}
                  </span>

                  {/* Download button — bigger tap target on mobile */}
                  <button
                    onClick={() => !downloading && startDownload(track)}
                    disabled={downloading}
                    className={`p-2.5 sm:p-2 -mr-1 rounded-xl sm:rounded-lg transition-colors ${
                      downloading
                        ? 'text-[#C8F04B] cursor-wait'
                        : 'text-[#666660] hover:text-[#C8F04B] active:text-[#C8F04B] hover:bg-[rgba(200,240,75,0.1)] active:bg-[rgba(200,240,75,0.1)]'
                    }`}
                    title="Descargar MP3"
                  >
                    {downloading ? (
                      <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Download className="w-5 h-5 sm:w-4 sm:h-4" />
                    )}
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        ) : !isSearching && query.trim() ? (
          <motion.p
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-[#666660] py-12"
          >
            No se encontraron resultados
          </motion.p>
        ) : !query.trim() ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 sm:py-16 space-y-3"
          >
            <Music className="w-10 h-10 text-[#333] mx-auto" />
            <p className="text-sm text-[#666660]">Busca una canción para comenzar</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
