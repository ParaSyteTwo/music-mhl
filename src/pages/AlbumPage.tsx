import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play, Shuffle, Heart, AlertCircle, RotateCcw } from 'lucide-react';
import { deezerService } from '../lib/deezer';
import { useMusicStore } from '../store/musicStore';
import { Skeleton } from '../components/ui/skeleton';

const AlbumLoadingSkeleton = () => (
  <div className="space-y-8">
    <div className="flex gap-8">
      <Skeleton className="w-60 h-60 rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-12 w-32 rounded-xl" />
          <Skeleton className="h-12 w-24 rounded-xl" />
        </div>
      </div>
    </div>

    <div className="space-y-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  </div>
);

export const AlbumPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack, addToLibrary } = useMusicStore();

  const albumId = parseInt(id || '0', 10);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => deezerService.getAlbum(albumId),
    enabled: !!albumId,
  });

  const album = data?.album;
  const moreByArtist = data?.moreByArtist || [];

  if (error) {
    return (
      <div className="min-h-screen bg-[#080808] pt-20 pb-32 px-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-500" />
          <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">
            Album Not Found
          </h2>
          <p className="text-[#666660]">Couldn't load the album. Try again.</p>
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#C8F04B] text-black font-syne font-semibold rounded-xl hover:scale-105 transition-transform w-full"
          >
            <RotateCcw size={18} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080808] pt-20 pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          <AlbumLoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!album) return null;

  // Calculate total duration
  const totalDuration = album.tracks?.reduce((sum: number, track: any) => sum + (track.duration || 0), 0) || 0;
  const totalMinutes = Math.floor(totalDuration / 60);

  return (
    <div className="min-h-screen bg-[#080808] pt-20 pb-32">
      <div className="max-w-5xl mx-auto px-6 space-y-8">
        {/* Header with Cover and Info */}
        <div className="flex gap-8">
          {/* Cover */}
          <div className="flex-shrink-0">
            <img
              src={album.cover}
              alt={album.title}
              className="w-60 h-60 rounded-2xl object-cover shadow-2xl"
            />
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col justify-end space-y-6">
            <div className="space-y-3">
              <p className="text-sm text-[#A0A0A0] font-dm-sans">Album</p>
              <h1 className="font-syne text-5xl font-bold text-[#F5F5F0]">
                {album.title}
              </h1>
              <button
                onClick={() => navigate(`/artist/${album.artist.id}`)}
                className="text-lg text-[#C8F04B] hover:text-[#8BC34A] transition-colors font-dm-sans"
              >
                {album.artist.name}
              </button>
            </div>

            {/* Meta Info */}
            <div className="flex gap-8 text-sm text-[#666660] font-dm-sans">
              <div>
                <p className="text-xs text-[#A0A0A0] mb-1">RELEASE DATE</p>
                <p className="text-[#F5F5F0]">{new Date(album.releaseDate).getFullYear()}</p>
              </div>
              <div>
                <p className="text-xs text-[#A0A0A0] mb-1">TRACKS</p>
                <p className="text-[#F5F5F0]">{album.trackCount}</p>
              </div>
              <div>
                <p className="text-xs text-[#A0A0A0] mb-1">DURATION</p>
                <p className="text-[#F5F5F0]">{totalMinutes} minutes</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  album.tracks?.forEach((track: any) => playTrack(track));
                }}
                className="flex items-center gap-2 px-6 py-3 bg-[#C8F04B] text-black font-syne font-semibold rounded-xl hover:scale-105 transition-transform"
              >
                <Play size={18} />
                Play All
              </button>
              <button className="flex items-center gap-2 px-6 py-3 border border-[rgba(255,255,255,0.2)] text-[#F5F5F0] font-dm-sans rounded-xl hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                <Shuffle size={18} />
                Shuffle
              </button>
              <button
                onClick={() => addToLibrary(album as any)}
                className="flex items-center gap-2 px-6 py-3 border border-[rgba(255,255,255,0.2)] text-[#F5F5F0] font-dm-sans rounded-xl hover:bg-[rgba(255,255,255,0.04)] transition-colors"
              >
                <Heart size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Tracklist */}
        <div className="space-y-4">
          <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">
            Tracks
          </h2>

          <div className="space-y-1">
            {album.tracks?.map((track: any, idx: number) => (
              <div
                key={track.id}
                className="flex items-center gap-4 p-4 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors group cursor-pointer"
                onClick={() => playTrack(track)}
              >
                {/* Number / Play Icon */}
                <div className="w-8 text-center">
                  <span className="font-mono text-sm text-[#666660] group-hover:hidden">
                    {idx + 1}
                  </span>
                  <Play
                    size={16}
                    className="hidden group-hover:block text-[#C8F04B]"
                  />
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">
                    {track.title}
                  </p>
                  <p className="text-xs text-[#666660] truncate">
                    {track.artist?.name || 'Unknown Artist'}
                  </p>
                </div>

                {/* Duration */}
                <span className="text-xs font-mono text-[#666660] w-12 text-right">
                  {Math.floor(track.duration / 60)}:
                  {String(track.duration % 60).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* More by this Artist */}
        {moreByArtist.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">
              More by {album.artist.name}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {moreByArtist.map((album: any) => (
                <div
                  key={album.id}
                  className="space-y-3 cursor-pointer group"
                  onClick={() => navigate(`/album/${album.id}`)}
                >
                  <div
                    className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center text-black text-3xl font-syne font-bold group-hover:scale-105 transition-transform overflow-hidden"
                    style={{
                      backgroundImage: `url('${album.cover}')`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!album.cover && '💿'}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">
                      {album.title}
                    </p>
                    <p className="text-xs text-[#666660] truncate">
                      {album.releaseDate?.split('-')[0]}
                    </p>
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
