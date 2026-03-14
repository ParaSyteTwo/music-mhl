import { Play, Pause, Download, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Track } from '@/types/music';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

interface TrackRowProps {
  track: Track;
  index: number;
  showIndex?: boolean;
  playlistId?: string;
  contextTracks?: Track[];
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackRow({ track, index, showIndex = true, playlistId, contextTracks }: TrackRowProps) {
  const { player, playTrack, togglePlay, startDownload, playlists, addToPlaylist, addToLibrary, removeFromPlaylist, removeFromLibrary, playQueue } = useMusicStore();
  const isCurrentTrack = player.currentTrack?.id === track.id;
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentTrack) {
      togglePlay();
    } else if (contextTracks && contextTracks.length > 1) {
      const idx = contextTracks.findIndex(t => t.id === track.id);
      playQueue(contextTracks, idx >= 0 ? idx : 0);
    } else {
      playTrack(track);
    }
  };

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
        <button onClick={handlePlay} className={`${showIndex ? 'hidden group-hover:block' : 'block'}`}>
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
        <span className="timer-font text-xs text-muted-foreground w-10 text-right">{formatDuration(track.duration)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); startDownload(track, 'MP3'); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Download className="w-4 h-4" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                className="absolute right-0 top-full mt-1 glass-panel rounded-lg py-1 min-w-[180px] z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { addToLibrary(track); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-3 h-3" /> Añadir a biblioteca
                </button>
                {playlists.length > 0 && (
                  <>
                    <div className="h-px bg-border my-1" />
                    <p className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Añadir a playlist</p>
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => { addToPlaylist(pl.id, track); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors truncate"
                      >
                        {pl.name}
                      </button>
                    ))}
                  </>
                )}
                {playlistId && (
                  <>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => { removeFromPlaylist(playlistId, track.id); setShowMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 text-destructive"
                    >
                      <Trash2 className="w-3 h-3" /> Quitar de playlist
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
