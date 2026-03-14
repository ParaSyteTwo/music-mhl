import { useMusicStore } from '@/store/musicStore';
import { TrackCard } from '@/components/music/TrackCard';
import { motion } from 'framer-motion';
import { TrendingUp, Clock, Zap } from 'lucide-react';

export default function HomePage() {
  const { searchResults, library } = useMusicStore();
  const recentTracks = searchResults.slice(0, 4);
  const trendingTracks = searchResults.slice(2, 6);

  return (
    <div className="px-8 py-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-12"
      >
        <h1 className="text-4xl font-semibold tracking-tighter text-balance mb-2">
          Your library, <span className="text-primary">uncompressed.</span>
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg">
          Busca, escucha y descarga música en alta calidad. Tu colección organizada como una estación de trabajo profesional.
        </p>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-12">
        {[
          { icon: Zap, label: 'Tracks', value: searchResults.length.toString(), sub: 'disponibles' },
          { icon: Clock, label: 'Biblioteca', value: library.length.toString(), sub: 'guardadas' },
          { icon: TrendingUp, label: 'Descargas', value: '2', sub: 'activas' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tighter timer-font">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Recently Added */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold tracking-tight mb-4">Recientes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {recentTracks.map((track, i) => (
            <TrackCard key={track.id} track={track} index={i} />
          ))}
        </div>
      </section>

      {/* Trending */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold tracking-tight mb-4">Tendencia</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {trendingTracks.map((track, i) => (
            <TrackCard key={track.id} track={track} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
