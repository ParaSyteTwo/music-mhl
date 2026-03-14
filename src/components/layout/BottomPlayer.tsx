import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, Repeat, Shuffle } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function BottomPlayer() {
  const { player, togglePlay, setVolume, setProgress, toggleLyrics } = useMusicStore();
  const { currentTrack, isPlaying, volume, progress, duration } = player;
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const [hoverProgress, setHoverProgress] = useState(false);

  // Simulate playback progress
  useEffect(() => {
    if (isPlaying && currentTrack) {
      intervalRef.current = setInterval(() => {
        setProgress(Math.min(progress + 1, duration));
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, progress, duration, currentTrack, setProgress]);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[var(--player-height)] glass-panel z-40 flex flex-col">
      {/* Progress bar */}
      <div
        className="h-1 w-full bg-muted/30 cursor-pointer group relative"
        onMouseEnter={() => setHoverProgress(true)}
        onMouseLeave={() => setHoverProgress(false)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          setProgress(x * duration);
        }}
      >
        <div
          className="h-full bg-primary transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />
        <AnimatePresence>
          {hoverProgress && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary"
              style={{ left: `${progressPercent}%`, marginLeft: -6 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Player controls */}
      <div className="flex-1 flex items-center px-4 gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 w-[260px] min-w-0">
          {currentTrack ? (
            <>
              <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/20" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{currentTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No track selected</p>
          )}
        </div>

        {/* Center controls */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-4">
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Shuffle className="w-4 h-4" />
            </button>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center hover:scale-105 transition-transform brand-transition"
              disabled={!currentTrack}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-background" />
              ) : (
                <Play className="w-4 h-4 text-background ml-0.5" />
              )}
            </button>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipForward className="w-4 h-4" />
            </button>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Repeat className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground timer-font">
            <span>{formatTime(progress)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3 w-[200px] justify-end">
          <button
            onClick={toggleLyrics}
            className={`transition-colors ${player.showLyrics ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Mic2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <div className="w-24 h-1 bg-muted/30 rounded-full cursor-pointer group relative"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setVolume((e.clientX - rect.left) / rect.width);
            }}
          >
            <div className="h-full bg-foreground/60 rounded-full" style={{ width: `${volume * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
