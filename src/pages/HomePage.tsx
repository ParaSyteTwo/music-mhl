import { useMusicStore } from '@/store/musicStore';
import { TrackCard } from '@/components/music/TrackCard';
import { SearchBar } from '@/components/music/SearchBar';
import { motion } from 'framer-motion';
import { TrendingUp, Search, Music2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getTrendingTracks } from '@/lib/api/musicApi';
import { Track } from '@/types/music';

export default function HomePage() {
  const { searchResults, library } = useMusicStore();
  const [trending, setTrending] = useState<Track[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);

  useEffect(() => {
    const loadTrending = async () => {
      try {
        const data = await getTrendingTracks(20);
        setTrending(data);
      } catch (error) {
        console.error('Error loading trending:', error);
      } finally {
        setIsLoadingTrending(false);
      }
    };
    loadTrending();
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 sm:mb-10"
      >
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tighter text-balance mb-2">
          Your library, <span className="text-primary">uncompressed.</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-lg mb-4 sm:mb-6">
          Busca, escucha y descarga música en alta calidad. Powered by Deezer + YouTube + LRCLIB.
        </p>
        <SearchBar />
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8 sm:mb-12">
        {[
          { icon: Search, label: 'Resultados', value: searchResults.length.toString(), sub: 'encontrados' },
          { icon: Music2, label: 'Biblioteca', value: library.length.toString(), sub: 'guardadas' },
          { icon: TrendingUp, label: 'Fuentes', value: '3', sub: 'Deezer · YT · LRCLIB' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-panel rounded-lg p-2 sm:p-4"
          >
            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
              <stat.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-lg sm:text-2xl font-semibold tracking-tighter timer-font">{stat.value}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <section className="mb-8 sm:mb-12">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight mb-3 sm:mb-4">Resultados</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
            {searchResults.map((track, i) => (
              <TrackCard key={track.id} track={track} index={i} />
            ))}
          </div>
        </section>
      )}

      {searchResults.length === 0 && (
        <>
          {trending.length > 0 && (
            <section className="mb-8 sm:mb-12">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Trending Global
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                {trending.map((track, i) => (
                  <TrackCard key={track.id} track={track} index={i} />
                ))}
              </div>
            </section>
          )}
          {!isLoadingTrending && trending.length === 0 && (
            <div className="text-center py-16">
              <Music2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">No se pudieron cargar las tendencias</p>
              <p className="text-xs text-muted-foreground mt-1">Prueba buscando una canción directamente</p>
            </div>
          )}
          {isLoadingTrending && (
            <div className="text-center py-16">
              <Music2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground text-sm">Cargando tendencias...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
