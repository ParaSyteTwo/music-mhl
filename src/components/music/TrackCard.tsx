import { Play, Download, Plus } from 'lucide-react';
import { Track } from '@/types/music';
import { useMusicStore } from '@/store/musicStore';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface TrackCardProps {
  track: Track;
  index?: number;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackCard({ track, index = 0 }: TrackCardProps) {
  const { playTrack, addToLibrary, startDownload } = useMusicStore();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="track-card group p-3 rounded-lg"
      onClick={() => navigate(`/track/${track.id}`)}
    >
      {/* Cover */}
      <div className="aspect-square rounded-md bg-secondary overflow-hidden relative mb-3">
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/10 to-secondary" />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setCurrentTrack(track); }}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:scale-110 transition-transform brand-transition"
          >
            <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); startDownload(track, 'MP3'); }}
            className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); addToLibrary(track); }}
            className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-foreground" />
          </button>
        </div>
      </div>

      {/* Info */}
      <h3 className="text-sm font-medium truncate">{track.title}</h3>
      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="timer-font text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
        {track.format && (
          <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
            {track.format}
          </span>
        )}
      </div>
    </motion.div>
  );
}
