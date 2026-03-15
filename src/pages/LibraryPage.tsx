import { useMusicStore } from '@/store/musicStore';
import { TrackRow } from '@/components/music/TrackRow';
import { Music, User, Disc, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

type LibraryTab = 'songs' | 'artists' | 'albums';

export default function LibraryPage() {
  const { library, removeFromLibrary, playQueue } = useMusicStore();
  const [tab, setTab] = useState<LibraryTab>('songs');
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);

  const artists = [...new Set(library.map(t => t.artist))];
  const albums = [...new Set(library.map(t => t.album))];

  const filteredTracks = artistFilter
    ? library.filter(t => t.artist === artistFilter)
    : albumFilter
    ? library.filter(t => t.album === albumFilter)
    : library;

  const tabs: { key: LibraryTab; label: string; icon: typeof Music; count: number }[] = [
    { key: 'songs', label: 'Songs', icon: Music, count: library.length },
    { key: 'artists', label: 'Artists', icon: User, count: artists.length },
    { key: 'albums', label: 'Albums', icon: Disc, count: albums.length },
  ];

  const clearFilters = () => { setArtistFilter(null); setAlbumFilter(null); };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-[family-name:Syne] text-[#F5F5F0]">Library</h1>
        {library.length > 0 && tab === 'songs' && (
          <button
            onClick={() => playQueue(filteredTracks, 0)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#C8F04B]/10 text-[#C8F04B] hover:bg-[#C8F04B]/20 transition-colors"
          >
            <Play className="w-4 h-4" />
            Reproducir todo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 sm:mb-8 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 sm:pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); clearFilters(); }}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === t.key 
                ? 'bg-[#C8F04B]/10 text-[#C8F04B]' 
                : 'text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <t.icon className="w-3 h-3 sm:w-4 sm:h-4" />
            {t.label}
            <span className="timer-font text-[10px] sm:text-xs ml-0.5 sm:ml-1 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Active filter */}
      {(artistFilter || albumFilter) && (
        <div className="flex items-center gap-2 mb-4 sm:mb-6 overflow-x-auto">
          <span className="text-xs text-[#333330]">Filtrando:</span>
          <span className="text-xs font-semibold bg-[#C8F04B]/10 text-[#C8F04B] px-2 py-1 rounded">
            {artistFilter || albumFilter}
          </span>
          <button onClick={clearFilters} className="text-xs text-[#666660] hover:text-[#F5F5F0]">
            × Limpiar
          </button>
        </div>
      )}

      {/* Content */}
      {tab === 'songs' && (
        <div className="space-y-0.5 sm:space-y-1">
          {filteredTracks.length > 0 ? (
            filteredTracks.map((track, i) => (
              <div key={track.id} className="group relative">
                <TrackRow track={track} index={i} contextTracks={filteredTracks} />
              </div>
            ))
          ) : (
            <div className="text-center py-20">
              <Music className="w-10 h-10 text-[#333330] mx-auto mb-4" />
              <p className="text-[#666660] text-sm">
                {library.length === 0 ? 'Tu biblioteca está vacía' : 'Sin resultados'}
              </p>
              <p className="text-xs text-[#333330] mt-2">Busca canciones y añádelas a tu colección</p>
            </div>
          )}
        </div>
      )}

      {tab === 'artists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
          {artists.length > 0 ? artists.map((artist, i) => {
            const artistTracks = library.filter(t => t.artist === artist);
            const cover = artistTracks[0]?.cover;
            return (
              <motion.div
                key={artist}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-lg p-5 text-center cursor-pointer hover:bg-white/5 transition-colors group"
                onClick={() => { setTab('songs'); setArtistFilter(artist); setAlbumFilter(null); }}
              >
                <div className="w-16 h-16 rounded-full mx-auto mb-3 overflow-hidden bg-gradient-to-br from-primary/30 to-accent/20">
                  {cover && <img src={cover} alt={artist} className="w-full h-full object-cover" />}
                </div>
                <p className="text-sm font-medium truncate">{artist}</p>
                <p className="text-xs text-muted-foreground timer-font">{artistTracks.length} tracks</p>
                <button
                  onClick={(e) => { e.stopPropagation(); playQueue(artistTracks, 0); }}
                  className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary"
                >
                  ▶ Reproducir
                </button>
              </motion.div>
            );
          }) : (
            <div className="col-span-full text-center py-20">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin artistas</p>
            </div>
          )}
        </div>
      )}

      {tab === 'albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
          {albums.length > 0 ? albums.map((album, i) => {
            const albumTracks = library.filter(t => t.album === album);
            const cover = albumTracks[0]?.cover;
            return (
              <motion.div
                key={album}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-lg p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                onClick={() => { setTab('songs'); setAlbumFilter(album); setArtistFilter(null); }}
              >
                <div className="aspect-square rounded-md mb-3 overflow-hidden bg-gradient-to-br from-primary/20 via-accent/10 to-secondary">
                  {cover && <img src={cover} alt={album} className="w-full h-full object-cover" />}
                </div>
                <p className="text-sm font-medium truncate">{album}</p>
                <p className="text-xs text-muted-foreground truncate">{albumTracks[0]?.artist}</p>
                <p className="text-xs text-muted-foreground timer-font mt-1">{albumTracks.length} tracks</p>
                <button
                  onClick={(e) => { e.stopPropagation(); playQueue(albumTracks, 0); }}
                  className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary"
                >
                  ▶ Reproducir
                </button>
              </motion.div>
            );
          }) : (
            <div className="col-span-full text-center py-20">
              <Disc className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin álbumes</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
