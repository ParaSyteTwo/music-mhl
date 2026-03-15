import { useState, useEffect } from 'react';
import { Search, Music, Mic2 } from 'lucide-react';
import { useMusicStore } from '../store/musicStore';
import { useUnifiedSearch, useSearchHistory } from '../hooks/useSearch';
import { Skeleton } from '../components/ui/skeleton';

type SearchTab = 'all' | 'tracks' | 'artists' | 'albums';

const genreColors: Record<string, string> = {
  Pop: '#C8F04B',
  Rap: '#A0A0A0',
  Rock: '#F5F5F0',
  Electronic: '#6EE7B7',
  'R&B': '#FCA5A5',
  Latin: '#FCD34D',
};

function HeroResult({ track }: { track: any }) {
  const { playTrack } = useMusicStore();

  if (!track) return null;

  return (
    <button
      onClick={() => playTrack(track)}
      className="relative h-64 rounded-xl overflow-hidden group mb-12 cursor-pointer"
      style={{
        backgroundImage: `url(${track.cover || track.coverSmall})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/50 group-hover:bg-black/40 transition-all" />
      <div className="relative h-full flex flex-col justify-end p-6 space-y-3">
        <p className="text-xs text-[#A0A0A0]">Top result</p>
        <h2 className="font-syne text-3xl font-bold text-[#F5F5F0]">{track.title}</h2>
        <p className="text-[#999999]">{track.artist}</p>
      </div>
    </button>
  );
}

function TrackItem({ track }: { track: any }) {
  const { playTrack } = useMusicStore();

  return (
    <button
      onClick={() => playTrack(track)}
      className="w-full glass-panel px-4 py-3 flex items-center gap-4 group hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left"
    >
      {track.cover && (
        <div
          className="w-10 h-10 rounded flex-shrink-0"
          style={{
            backgroundImage: `url(${track.cover})`,
            backgroundSize: 'cover',
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">{track.title}</p>
        <p className="text-xs text-[#666660] truncate">{track.artist}</p>
      </div>
      {track.duration && (
        <span className="text-xs text-[#333330]">
          {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
        </span>
      )}
    </button>
  );
}

function ArtistCard({ artist }: { artist: any }) {
  const formatFans = (fans: number) => {
    if (fans > 1000000) return `${(fans / 1000000).toFixed(1)}M`;
    if (fans > 1000) return `${(fans / 1000).toFixed(1)}K`;
    return fans.toString();
  };

  return (
    <button className="glass-panel p-4 text-center space-y-3 hover:scale-105 transition-transform">
      {artist.picture ? (
        <div
          className="w-24 h-24 rounded-full overflow-hidden mx-auto"
          style={{
            backgroundImage: `url(${artist.picture})`,
            backgroundSize: 'cover',
          }}
        />
      ) : (
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center mx-auto">
          <Music size={32} className="text-black opacity-50" />
        </div>
      )}
      <div>
        <p className="text-xs font-syne font-semibold text-[#F5F5F0] truncate">{artist.name}</p>
        <p className="text-xs text-[#333330]">{formatFans(artist.fans)} fans</p>
      </div>
    </button>
  );
}

function AlbumCard({ album }: { album: any }) {
  return (
    <button className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform">
      {album.cover ? (
        <div
          className="w-full aspect-square rounded-lg" 
          style={{
            backgroundImage: `url(${album.cover})`,
            backgroundSize: 'cover',
          }}
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center">
          <Music size={32} className="text-black opacity-50" />
        </div>
      )}
      <div>
        <p className="text-xs font-syne font-semibold text-[#F5F5F0] line-clamp-2">{album.title}</p>
        <p className="text-xs text-[#666660] truncate">{album.artist}</p>
        <p className="text-xs text-[#333330]">{album.releaseDate?.split('-')[0]}</p>
      </div>
    </button>
  );
}

function GenreGrid() {
  const genres = ['Pop', 'Rap', 'Rock', 'Electronic', 'R&B', 'Latin'];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {genres.map((genre) => (
        <button
          key={genre}
          className="aspect-square rounded-lg flex items-center justify-center font-syne font-bold text-lg hover:scale-105 transition-transform"
          style={{
            backgroundColor: `${genreColors[genre]}20`,
            color: genreColors[genre],
            border: `2px solid ${genreColors[genre]}40`,
          }}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}

export function SearchPage() {
  const { query, results, loading, error, search } = useUnifiedSearch();
  const { recentSearches, clearHistory } = useSearchHistory();
  const [tab, setTab] = useState<SearchTab>('all');
  const [localQuery, setLocalQuery] = useState('');

  const tabs: { id: SearchTab; label: string; count: number }[] = [
    { id: 'all', label: 'Todo', count: results.tracks.length + results.artists.length + results.albums.length },
    { id: 'tracks', label: 'Canciones', count: results.tracks.length },
    { id: 'artists', label: 'Artistas', count: results.artists.length },
    { id: 'albums', label: 'Álbumes', count: results.albums.length },
  ];

  const handleSearch = (q: string) => {
    setLocalQuery(q);
    search(q);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      handleSearch(localQuery);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] pt-6 pb-32">
      <div className="max-w-7xl mx-auto px-6">
        {/* HEADER */}
        <div className="mb-8 space-y-4">
          <h1 className="font-syne text-4xl font-bold text-[#F5F5F0]">Explorar</h1>
          
          {/* SEARCH INPUT */}
          <form onSubmit={handleSubmit} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#666660]" size={20} />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Busca canciones, artistas o álbumes..."
              className="w-full pl-12 pr-6 py-3 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] rounded-lg text-[#F5F5F0] placeholder:text-[#333330] focus:outline-none focus:border-[#C8F04B] focus:ring-1 focus:ring-[#C8F04B]"
            />
          </form>
        </div>

        {/* NO QUERY */}
        {!query && (
          <>
            {recentSearches.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-syne text-lg font-bold text-[#F5F5F0]">Búsquedas recientes</h2>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-[#333330] hover:text-[#666660] transition-colors"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search) => (
                    <button
                      key={search}
                      onClick={() => handleSearch(search)}
                      className="px-3 py-1 bg-[rgba(200,240,75,0.1)] text-[#C8F04B] text-xs rounded-full hover:bg-[rgba(200,240,75,0.2)] transition-colors"
                    >
                      {search}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="font-syne text-lg font-bold text-[#F5F5F0] mb-6">Explora géneros</h2>
              <GenreGrid />
            </section>
          </>
        )}

        {/* WITH QUERY */}
        {query && (
          <>
            {/* TABS */}
            <div className="flex gap-2 mb-8 border-b border-[rgba(255,255,255,0.06)] pb-4">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 font-dm-sans text-sm transition-colors ${
                    tab === t.id
                      ? 'text-[#C8F04B] border-b-2 border-[#C8F04B]'
                      : 'text-[#666660] hover:text-[#F5F5F0]'
                  }`}
                >
                  {t.label} · {t.count}
                </button>
              ))}
            </div>

            {/* LOADING */}
            {loading && (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            )}

            {/* ERROR */}
            {error && !loading && (
              <div className="p-4 bg-[rgba(255,77,109,0.08)] border border-[rgba(255,77,109,0.2)] rounded-lg">
                <p className="text-sm text-[#FF6B7F]">{error}</p>
              </div>
            )}

            {/* RESULTS */}
            {!loading && !error && (
              <>
                {/* ALL TAB */}
                {tab === 'all' && (
                  <div className="space-y-12">
                    {/* Hero result */}
                    {results.tracks.length > 0 && <HeroResult track={results.tracks[0]} />}

                    {/* Tracks section */}
                    {results.tracks.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Canciones</h3>
                        <div className="space-y-2">
                          {results.tracks.slice(0, 5).map((track) => (
                            <TrackItem key={track.id} track={track} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Artists section */}
                    {results.artists.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Artistas</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {results.artists.slice(0, 4).map((artist) => (
                            <ArtistCard key={artist.id} artist={artist} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Albums section */}
                    {results.albums.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Álbumes</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {results.albums.slice(0, 4).map((album) => (
                            <AlbumCard key={album.id} album={album} />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {/* TRACKS TAB */}
                {tab === 'tracks' && (
                  <div className="space-y-2">
                    {results.tracks.length > 0 ? (
                      results.tracks.map((track) => <TrackItem key={track.id} track={track} />)
                    ) : (
                      <p className="text-center py-8 text-[#333330]">No se encontraron canciones</p>
                    )}
                  </div>
                )}

                {/* ARTISTS TAB */}
                {tab === 'artists' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {results.artists.length > 0 ? (
                      results.artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)
                    ) : (
                      <p className="col-span-full text-center py-8 text-[#333330]">No se encontraron artistas</p>
                    )}
                  </div>
                )}

                {/* ALBUMS TAB */}
                {tab === 'albums' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {results.albums.length > 0 ? (
                      results.albums.map((album) => <AlbumCard key={album.id} album={album} />)
                    ) : (
                      <p className="col-span-full text-center py-8 text-[#333330]">No se encontraron álbumes</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SearchPage;

