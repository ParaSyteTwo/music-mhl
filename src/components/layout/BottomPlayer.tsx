import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, Repeat, Repeat1, Shuffle, Loader2, Youtube, Radio, List } from 'lucide-react';
import { useMusicStore, RepeatMode } from '@/store/musicStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { QueuePanel } from '@/components/music/QueuePanel';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function BottomPlayer() {
  const { player, togglePlay, setVolume, seekTo, toggleLyrics, playTrackWithYouTube, skipNext, skipPrev, toggleShuffle, toggleRepeat } = useMusicStore();
  const { currentTrack, isPlaying, isLoading, volume, progress, duration, audioSource, error, shuffle, repeat, queue } = player;
  const [hoverProgress, setHoverProgress] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 h-[var(--player-height)] glass-panel z-40 flex flex-col">
        {/* Progress bar */}
        <div
          className="h-1 w-full bg-muted/30 cursor-pointer group relative"
          onMouseEnter={() => setHoverProgress(true)}
          onMouseLeave={() => setHoverProgress(false)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            seekTo(x * duration);
          }}
        >
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
          <AnimatePresence>
            {hoverProgress && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary"
                style={{ left: `${Math.min(progressPercent, 100)}%`, marginLeft: -6 }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Player controls - Responsive Layout */}
        <div className="flex-1 flex items-center px-2 sm:px-4 gap-2 sm:gap-4">
          {/* Track info - Hidden on mobile */}
          <div className="hidden sm:flex items-center gap-3 w-[280px] min-w-0">
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {audioSource === 'youtube' ? (
                      <span className="flex items-center gap-1 text-[10px] text-red-400 font-mono">
                        <Youtube className="w-2.5 h-2.5" /> YT
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-primary font-mono">
                        <Radio className="w-2.5 h-2.5" /> Preview
                      </span>
                    )}
                    {queue.length > 1 && (
                      <span className="text-[10px] text-muted-foreground font-mono ml-1">
                        {player.queueIndex + 1}/{queue.length}
                      </span>
                    )}
                  </div>
                </div>
                {audioSource === 'preview' && currentTrack && (
                  <button
                    onClick={() => playTrackWithYouTube(currentTrack)}
                    className="shrink-0 text-[10px] font-mono px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Reproducir completo via YouTube"
                  >
                    Full
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No track selected</p>
            )}
          </div>

          {/* Center controls - Responsive */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Shuffle - Hidden on mobile */}
              <button
                onClick={toggleShuffle}
                className={`hidden sm:block transition-colors ${shuffle ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title={shuffle ? 'Aleatorio: activado' : 'Aleatorio: desactivado'}
              >
                <Shuffle className="w-4 h-4" />
              </button>
              
              <button
                onClick={skipPrev}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Anterior"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              
              <button
                onClick={togglePlay}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-foreground flex items-center justify-center hover:scale-105 transition-transform brand-transition"
                disabled={!currentTrack || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-background animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 text-background" />
                ) : (
                  <Play className="w-4 h-4 text-background ml-0.5" />
                )}
              </button>
              
              <button
                onClick={skipNext}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Siguiente"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              
              {/* Repeat - Hidden on mobile */}
              <button
                onClick={toggleRepeat}
                className={`hidden sm:block transition-colors ${repeat !== 'off' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title={`Repetir: ${repeat === 'off' ? 'desactivado' : repeat === 'all' ? 'todo' : 'una'}`}
              >
                {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground timer-font">
              <span>{formatTime(progress)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
            
            {error && (
              <p className="text-[10px] text-destructive/80 font-mono truncate max-w-xs">{error}</p>
            )}
          </div>

          {/* Right controls - Mobile optimized */}
          <div className="flex items-center gap-2 sm:gap-3">
            {queue.length > 0 && (
              <button
                onClick={() => setShowQueue(true)}
                className="relative text-muted-foreground hover:text-foreground transition-colors"
                title="Ver cola"
              >
                <List className="w-4 h-4" />
                {queue.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-background text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </button>
            )}
            
            <button
              onClick={toggleLyrics}
              className={`transition-colors ${player.showLyrics ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Mostrar letras"
            >
              <Mic2 className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
              title="Volumen"
            >
              {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            
            {/* Volume slider - Hidden on very small screens */}
            <div
              className="w-16 sm:w-24 h-1 bg-muted/30 rounded-full cursor-pointer hidden sm:block"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume((e.clientX - rect.left) / rect.width);
              }}
              title="Ajustar volumen"
            >
              <div className="h-full bg-foreground/60 rounded-full" style={{ width: `${volume * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Queue Panel */}
      <QueuePanel isOpen={showQueue} onClose={() => setShowQueue(false)} />
    </>
  );
}
