import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Music } from 'lucide-react';
import { useMusicStore } from '../store/musicStore';
import { useUnifiedSearch, useSearchHistory } from '../hooks/useSearch';
import { fetchGenreChart } from '../lib/api/musicApi';
import { Skeleton } from '../components/ui/skeleton';

type SearchTab = 'all' | 'tracks' | 'artists' | 'albums';

const genreColors: Record<string, string> = {
  Pop: '#C8F04B', Rap: '#A0A0A0', Rock: '#F5F5F0',
  Electronic: '#6EE7B7', 'R&B': '#FCA5A5', Latin: '#FCD34D',
};

function TrackItem({ track }: { track: any }) {
  const { playTrack } = useMusicStore();
  return (
    <button onClick={() => playTrack(track)}
      className="w-full glass-panel px-4 py-3 flex items-center gap-4 group hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left">
      {track.cover && (
        <div className="w-10 h-10 rounded flex-shrink-0 overflow-hidden"
          style={{ backgroundImage: `url(${track.cover})`, backgroundSize: 'cover' }} />
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
  const navigate = useNavigate();
  const formatFans = (fans: number) => {
    if (fans > 1000000) return `${(fans / 1000000).toFixed(1)}M`;
    if (fans > 1000) return `${(fans / 1000).toFixed(1)}K`;
    return fans?.toString() || '0';
  };

  return (
    <button onClick={() => navigate(`/artist/${artist.id}`)}
      className="glass-panel p-4 text-center space-y-3 hover:scale-105 transition-transform">
      {artist.picture ? (
        <div className="w-24 h-24 rounded-full overflow-hidden mx-auto"
          style={{ backgroundImage: `url(${artist.picture})`, backgroundSize: 'cover' }} />
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
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/album/${album.deezerId}`)}
      className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform">
      {album.cover ? (
        <div className="w-full aspect-square rounded-lg overflow-hidden"
          style={{ backgroundImage: `url(${album.cover})`, backgroundSize: 'cover' }} />
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

function GenreGrid({ onGenreClick }: { onGenreClick: (genre: string, genreId: number) => void }) {
  const genreIds: Record<string, number> = { Pop: 132, Rap: 116, Rock: 152, Electronic: 106, 'R&B': 165, Latin: 197 };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {Object.entries(genreIds).map(([genre, id]) => (
        <button key={genre} onClick={() => onGenreClick(genre, id)}
          className="aspect-square rounded-lg flex items-center justify-center font-syne font-bold text-lg hover:scale-105 transition-transform cursor-pointer"
          style={{ backgroundColor: `${genreColors[genre]}20`, color: genreColors[genre], border: `2px solid ${genreColors[genre]}40` }}>
          {genre}
        </button>
      ))}
    </div>
  );
}

export function SearchPage() {
  const { query, setQuery, results, loading, error } = useUnifiedSearch();
  const { recentSearches, clearHistory } = useSearchHistory();
  const [tab, setTab] = useState<SearchTab>('all');
  const [activeGenre, setActiveGenre] = useState<{ name: string; id: number } | null>(null);
  const [genreResults, setGenreResults] = useState<any[] | null>(null);
  const [genreLoading, setGenreLoading] = useState(false);

  const handleSearch = (q: string) => { setQuery(q); setActiveGenre(null); };

  const handleGenreClick = async (genreName: string, genreId: number) => {
    setActiveGenre({ name: genreName, id: genreId });
    setQuery('');
    setGenreLoading(true);
    try {
      const tracks = await fetchGenreChart(genreId);
      setGenreResults(tracks);
    } catch { setGenreResults([]); }
    finally { setGenreLoading(false); }
  };

  const handleClearGenre = () => { setActiveGenre(null); setQuery(''); setGenreResults(null); };

  const tabs: { id: SearchTab; label: string; count: number }[] = [
    { id: 'all', label: 'Todo', count: results.tracks.length + results.artists.length + results.albums.length },
    { id: 'tracks', label: 'Canciones', count: results.tracks.length },
    { id: 'artists', label: 'Artistas', count: results.artists.length },
    { id: 'albums', label: 'Álbumes', count: results.albums.length },
  ];

  return (
    <div className="min-h-screen bg-[#080808] pt-6 pb-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-8 space-y-4">
          <h1 className="font-syne text-4xl font-bold text-[#F5F5F0]">Explorar</h1>
          <form onSubmit={(e) => e.preventDefault()} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#666660]" size={20} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca canciones, artistas o álbumes..."
              className="w-full pl-12 pr-6 py-3 bg-[#0f0f0f] border border-[rgba(255,255,255,0.08)] rounded-lg text-[#F5F5F0] placeholder:text-[#333330] focus:outline-none focus:border-[#C8F04B] focus:ring-1 focus:ring-[#C8F04B]" />
          </form>
        </div>

        {!query && !activeGenre && (
          <>
            {recentSearches.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-syne text-lg font-bold text-[#F5F5F0]">Búsquedas recientes</h2>
                  <button onClick={clearHistory} className="text-xs text-[#333330] hover:text-[#666660] transition-colors">Limpiar</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((s) => (
                    <button key={s} onClick={() => handleSearch(s)}
                      className="px-3 py-1 bg-[rgba(200,240,75,0.1)] text-[#C8F04B] text-xs rounded-full hover:bg-[rgba(200,240,75,0.2)] transition-colors">{s}</button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="font-syne text-lg font-bold text-[#F5F5F0] mb-6">Explora géneros</h2>
              <GenreGrid onGenreClick={handleGenreClick} />
            </section>
          </>
        )}

        {(query || activeGenre) && (
          <>
            {activeGenre && (
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[rgba(255,255,255,0.06)]">
                <span className="text-sm text-[#666660]">Explorar</span>
                <span className="text-[#333330]">→</span>
                <span className="text-sm font-semibold text-[#F5F5F0]">{activeGenre.name}</span>
                <button onClick={handleClearGenre} className="ml-auto text-xs px-3 py-1 text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.08)] rounded transition-colors">✕ Volver</button>
              </div>
            )}

            {query && !activeGenre && (
              <div className="flex gap-2 mb-8 border-b border-[rgba(255,255,255,0.06)] pb-4">
                {tabs.map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-4 py-2 font-dm-sans text-sm transition-colors ${tab === t.id ? 'text-[#C8F04B] border-b-2 border-[#C8F04B]' : 'text-[#666660] hover:text-[#F5F5F0]'}`}>
                    {t.label} · {t.count}
                  </button>
                ))}
              </div>
            )}

            {(loading || genreLoading) && (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            )}

            {error && !loading && (
              <div className="p-4 bg-[rgba(255,77,109,0.08)] border border-[rgba(255,77,109,0.2)] rounded-lg">
                <p className="text-sm text-[#FF6B7F]">{error}</p>
              </div>
            )}

            {!loading && !error && !genreLoading && (
              <>
                {activeGenre && genreResults && (
                  <div className="space-y-2">
                    {genreResults.length > 0 ? genreResults.map((track) => <TrackItem key={track.id} track={track} />) :
                      <p className="text-center py-8 text-[#333330]">No se encontraron canciones en {activeGenre.name}</p>}
                  </div>
                )}

                {!activeGenre && query && (tab === 'all' || tab === 'tracks') && (
                  <div className="space-y-12">
                    {results.tracks.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Canciones</h3>
                        <div className="space-y-2">
                          {results.tracks.slice(0, tab === 'all' ? 5 : undefined).map((track) => <TrackItem key={track.id} track={track} />)}
                        </div>
                      </section>
                    )}
                    {tab === 'all' && results.artists.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Artistas</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {results.artists.slice(0, 4).map((a) => <ArtistCard key={a.id} artist={a} />)}
                        </div>
                      </section>
                    )}
                    {tab === 'all' && results.albums.length > 0 && (
                      <section>
                        <h3 className="font-syne text-lg font-bold text-[#F5F5F0] mb-4">Álbumes</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {results.albums.slice(0, 4).map((a) => <AlbumCard key={a.id} album={a} />)}
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {!activeGenre && query && tab === 'artists' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {results.artists.length > 0 ? results.artists.map((a) => <ArtistCard key={a.id} artist={a} />) :
                      <p className="col-span-full text-center py-8 text-[#333330]">No se encontraron artistas</p>}
                  </div>
                )}

                {!activeGenre && query && tab === 'albums' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {results.albums.length > 0 ? results.albums.map((a) => <AlbumCard key={a.id} album={a} />) :
                      <p className="col-span-full text-center py-8 text-[#333330]">No se encontraron álbumes</p>}
                  </div>
                )}

                {!activeGenre && query && results.tracks.length === 0 && results.artists.length === 0 && results.albums.length === 0 && (
                  <div className="text-center py-12 space-y-3">
                    <p className="text-lg text-[#666660]">Sin resultados para "<span className="text-[#F5F5F0] font-semibold">{query}</span>"</p>
                    <p className="text-sm text-[#333330]">Intenta con otras palabras clave o explora los géneros disponibles</p>
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
