import { useMusicStore } from '@/store/musicStore';
import { TrackRow } from '@/components/music/TrackRow';
import { Music, User, Disc } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

type LibraryTab = 'songs' | 'artists' | 'albums';

export default function LibraryPage() {
  const { library } = useMusicStore();
  const [tab, setTab] = useState<LibraryTab>('songs');

  const artists = [...new Set(library.map(t => t.artist))];
  const albums = [...new Set(library.map(t => t.album))];

  const tabs: { key: LibraryTab; label: string; icon: typeof Music }[] = [
    { key: 'songs', label: 'Songs', icon: Music },
    { key: 'artists', label: 'Artists', icon: User },
    { key: 'albums', label: 'Albums', icon: Disc },
  ];

  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tighter mb-6">Library</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'songs' && (
        <div className="space-y-1">
          {library.length > 0 ? (
            library.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} />
            ))
          ) : (
            <div className="text-center py-20">
              <Music className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Tu biblioteca está vacía</p>
              <p className="text-xs text-muted-foreground mt-1">Busca canciones y añádelas a tu colección</p>
            </div>
          )}
        </div>
      )}

      {tab === 'artists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {artists.map((artist, i) => (
            <motion.div
              key={artist}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-panel rounded-lg p-5 text-center cursor-pointer hover:bg-white/5 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 mx-auto mb-3" />
              <p className="text-sm font-medium">{artist}</p>
              <p className="text-xs text-muted-foreground timer-font">
                {library.filter(t => t.artist === artist).length} tracks
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {tab === 'albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {albums.map((album, i) => {
            const albumTrack = library.find(t => t.album === album)!;
            return (
              <motion.div
                key={album}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-lg p-4 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="aspect-square rounded-md bg-gradient-to-br from-primary/20 via-accent/10 to-secondary mb-3" />
                <p className="text-sm font-medium truncate">{album}</p>
                <p className="text-xs text-muted-foreground truncate">{albumTrack.artist}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
