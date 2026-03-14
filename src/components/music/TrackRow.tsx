import { Play, Pause, Download, MoreHorizontal } from 'lucide-react';
import { Track } from '@/types/music';
import { useMusicStore } from '@/store/musicStore';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface TrackRowProps {
  track: Track;
  index: number;
  showIndex?: boolean;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackRow({ track, index, showIndex = true }: TrackRowProps) {
  const { player, playTrack, togglePlay, startDownload } = useMusicStore();
  const isCurrentTrack = player.currentTrack?.id === track.id;
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className={`group flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors duration-200 ${isCurrentTrack ? 'bg-white/5' : ''}`}
      onClick={() => navigate(`/track/${track.id}`)}
    >
      {/* Index / Play */}
      <div className="w-8 text-center shrink-0">
        {showIndex && (
          <span className={`timer-font text-sm group-hover:hidden ${isCurrentTrack ? 'text-primary' : 'text-muted-foreground'}`}>
            {index + 1}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); isCurrentTrack ? togglePlay() : playTrack(track); }}
          className={`${showIndex ? 'hidden group-hover:block' : 'block'}`}
        >
          {isCurrentTrack && player.isPlaying ? (
            <Pause className="w-4 h-4 text-primary mx-auto" />
          ) : (
            <Play className="w-4 h-4 text-foreground mx-auto" />
          )}
        </button>
      </div>

      {/* Cover */}
      <div className="w-10 h-10 rounded bg-secondary shrink-0 overflow-hidden">
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/10" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-primary' : ''}`}>{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>

      {/* Album */}
      <p className="text-xs text-muted-foreground truncate w-40 hidden md:block">{track.album}</p>

      {/* Metadata */}
      <div className="flex items-center gap-3 shrink-0">
        {track.bitrate && (
          <span className="timer-font text-xs text-muted-foreground hidden lg:inline">{track.bitrate}</span>
        )}
        <span className="timer-font text-xs text-muted-foreground w-10 text-right">{formatDuration(track.duration)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); startDownload(track, 'MP3'); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Download className="w-4 h-4" />
        </button>
        <button className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
