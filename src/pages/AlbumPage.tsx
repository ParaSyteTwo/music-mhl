import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Shuffle, Heart, AlertCircle, RotateCcw } from 'lucide-react';
import { fetchAlbumDetail } from '../lib/api/musicApi';
import { useMusicStore } from '../store/musicStore';
import { Skeleton } from '../components/ui/skeleton';

export const AlbumPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack, playQueue, addToLibrary } = useMusicStore();

  const albumId = parseInt(id || '0', 10);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!albumId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchAlbumDetail(albumId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load album');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [albumId]);

  const album = data?.album;
  const moreByArtist = data?.moreByArtist || [];

  if (error) {
    return (
      <div className="min-h-screen bg-[#080808] pt-20 pb-32 px-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-500" />
          <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">Album Not Found</h2>
          <p className="text-[#666660]">Couldn't load the album. Try again.</p>
          <button onClick={fetchData}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#C8F04B] text-black font-syne font-semibold rounded-xl hover:scale-105 transition-transform w-full">
            <RotateCcw size={18} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] pt-20 pb-32 px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex gap-8">
            <Skeleton className="w-60 h-60 rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-10 w-96" />
              <Skeleton className="h-6 w-48" />
              <div className="flex gap-3 pt-4">
                <Skeleton className="h-12 w-32 rounded-xl" />
                <Skeleton className="h-12 w-24 rounded-xl" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!album) return null;

  const totalDuration = album.tracks?.reduce((sum: number, t: any) => sum + (t.duration || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-[#080808] pt-20 pb-32">
      <div className="max-w-5xl mx-auto px-6 space-y-8">
        <div className="flex gap-8">
          <div className="flex-shrink-0">
            <img src={album.cover} alt={album.title} className="w-60 h-60 rounded-2xl object-cover shadow-2xl" />
          </div>
          <div className="flex-1 flex flex-col justify-end space-y-6">
            <div className="space-y-3">
              <p className="text-sm text-[#A0A0A0] font-dm-sans">Album</p>
              <h1 className="font-syne text-5xl font-bold text-[#F5F5F0]">{album.title}</h1>
              <button onClick={() => navigate(`/artist/dz-artist-${album.artist.id}`)}
                className="text-lg text-[#C8F04B] hover:text-[#8BC34A] transition-colors font-dm-sans">
                {album.artist.name}
              </button>
            </div>
            <div className="flex gap-8 text-sm text-[#666660] font-dm-sans">
              <div><p className="text-xs text-[#A0A0A0] mb-1">RELEASE DATE</p><p className="text-[#F5F5F0]">{new Date(album.releaseDate).getFullYear()}</p></div>
              <div><p className="text-xs text-[#A0A0A0] mb-1">TRACKS</p><p className="text-[#F5F5F0]">{album.trackCount}</p></div>
              <div><p className="text-xs text-[#A0A0A0] mb-1">DURATION</p><p className="text-[#F5F5F0]">{Math.floor(totalDuration / 60)} min</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => album.tracks?.length && playQueue(album.tracks, 0)}
                className="flex items-center gap-2 px-6 py-3 bg-[#C8F04B] text-black font-syne font-semibold rounded-xl hover:scale-105 transition-transform">
                <Play size={18} /> Play All
              </button>
              <button onClick={() => album.tracks?.length && playQueue([...album.tracks].sort(() => Math.random() - 0.5), 0)}
                className="flex items-center gap-2 px-6 py-3 border border-[rgba(255,255,255,0.2)] text-[#F5F5F0] font-dm-sans rounded-xl hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                <Shuffle size={18} /> Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">Tracks</h2>
          <div className="space-y-1">
            {album.tracks?.map((track: any, idx: number) => (
              <div key={track.id} onClick={() => playTrack(track)}
                className="flex items-center gap-4 p-4 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors group cursor-pointer">
                <div className="w-8 text-center">
                  <span className="font-mono text-sm text-[#666660] group-hover:hidden">{idx + 1}</span>
                  <Play size={16} className="hidden group-hover:block text-[#C8F04B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">{track.title}</p>
                  <p className="text-xs text-[#666660] truncate">{track.artist}</p>
                </div>
                <span className="text-xs font-mono text-[#666660] w-12 text-right">
                  {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {moreByArtist.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">More by {album.artist.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {moreByArtist.map((a: any) => (
                <div key={a.id} onClick={() => navigate(`/album/${a.deezerId}`)}
                  className="space-y-3 cursor-pointer group">
                  <div className="w-full aspect-square rounded-lg overflow-hidden group-hover:scale-105 transition-transform"
                    style={{ backgroundImage: `url('${a.cover}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="space-y-1">
                    <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">{a.title}</p>
                    <p className="text-xs text-[#666660] truncate">{a.releaseDate?.split('-')[0]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
