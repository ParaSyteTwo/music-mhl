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
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance mb-3 text-[#F5F5F0] font-[family-name:Syne]">
          Your library, <span className="text-[#C8F04B]">uncompressed.</span>
        </h1>
        <p className="text-[#666660] text-sm sm:text-base max-w-lg mb-6 sm:mb-8">
          Busca, escucha y descarga tu música en alta calidad.
        </p>
        <SearchBar />
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8 sm:mb-12">
        {[
          { icon: Search, label: 'Resultados', value: searchResults.length.toString(), sub: 'encontrados' },
          { icon: Music2, label: 'Biblioteca', value: library.length.toString(), sub: 'guardadas' },
          { icon: TrendingUp, label: 'Popular', value: trending.length.toString(), sub: 'trending' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] rounded-[16px] p-3 sm:p-4"
          >
            <div className="flex items-center gap-2 sm:gap-2 mb-2 sm:mb-3">
              <stat.icon className="w-3 h-3 sm:w-4 sm:h-4 text-[#C8F04B]" />
              <span className="text-[9px] sm:text-xs text-[#333330] uppercase tracking-wider font-semibold">{stat.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold tracking-tighter timer-font text-[#F5F5F0]">{stat.value}</p>
            <p className="text-[9px] sm:text-xs text-[#666660] mt-1">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <section className="mb-8 sm:mb-12">
          <h2 className="text-base sm:text-lg font-bold tracking-tight mb-4 sm:mb-6 font-[family-name:Syne] text-[#F5F5F0]">Resultados</h2>
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
              <h2 className="text-base sm:text-lg font-bold tracking-tight mb-4 sm:mb-6 font-[family-name:Syne] text-[#F5F5F0] flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
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
              <Music2 className="w-12 h-12 text-[#333330] mx-auto mb-4" />
              <p className="text-[#666660] text-sm">No se pudieron cargar las tendencias</p>
              <p className="text-[#333330] text-xs mt-2">Prueba buscando una canción directamente</p>
            </div>
          )}
          {isLoadingTrending && (
            <div className="text-center py-16">
              <Music2 className="w-12 h-12 text-[#333330] mx-auto mb-4 animate-pulse" />
              <p className="text-[#666660] text-sm">Cargando tendencias...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
