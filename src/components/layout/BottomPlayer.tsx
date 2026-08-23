import { useShallow } from 'zustand/react/shallow';
import { Play, Pause, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useI18n } from '@/lib/useI18n';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function BottomPlayer() {
  const { t } = useI18n();
  const { currentTrack, isPlaying, isLoading, volume, progress, duration, togglePlay, setVolume, seekTo, dominantColor } = useMusicStore(useShallow(s => ({ currentTrack: s.currentTrack, isPlaying: s.isPlaying, isLoading: s.isLoading, volume: s.volume, progress: s.progress, duration: s.duration, togglePlay: s.togglePlay, setVolume: s.setVolume, seekTo: s.seekTo, dominantColor: s.dominantColor })));
  const [hoverProgress, setHoverProgress] = useState(false);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const bottomStyle = 'calc(var(--nav-height) + var(--sab))';

  if (!currentTrack) return null;

  return (
    <>
      {/* Ambient Glow Background - Efecto Premium Apple Music */}
      {dominantColor && (
        <motion.div 
          className="fixed left-0 right-0 z-30 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          style={{
            bottom: bottomStyle,
            height: 'var(--player-height)',
            background: `linear-gradient(to top, rgba(${dominantColor}, 0.8), transparent)`,
            filter: 'blur(40px)',
          }}
        />
      )}

      {/* Progress bar con Micro-interacciones y Hitbox Touch Amplia */}
      <div
        className="fixed left-0 right-0 z-40 group select-none"
        style={{ bottom: `calc(${bottomStyle} + var(--player-height) - 4px)` }}
      >
        <div
          role="slider"
          aria-label={t('seek')}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration)}
          aria-valuenow={Math.min(progress, duration)}
          className="h-3.5 cursor-pointer flex items-center relative px-0"
          onMouseEnter={() => setHoverProgress(true)}
          onMouseLeave={() => setHoverProgress(false)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekTo(x * duration);
          }}
        >
          <div className="w-full h-1.5 group-hover:h-2 bg-white/10 relative rounded-full overflow-hidden transition-all duration-200">
            <div
              className="absolute inset-y-0 left-0 w-full origin-left rounded-r-full"
              style={{
                background: 'linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
                transform: `scaleX(${Math.min(Math.max(0, progressPercent / 100), 1)})`,
                willChange: 'transform',
                boxShadow: hoverProgress ? '0 0 15px var(--accent-glow)' : 'none',
              }}
            />
          </div>
          <AnimatePresence>
            {hoverProgress && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg pointer-events-none"
                style={{
                  left: `${Math.min(Math.max(0, progressPercent), 100)}%`,
                  marginLeft: -7,
                  boxShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px var(--accent-glow)',
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main player bar - Glassmorphism Mejorado */}
      <div
        className="fixed left-0 right-0 border-t border-white/10 z-40 px-4 sm:px-6"
        style={{
          bottom: bottomStyle,
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          height: 'var(--player-height)',
          background: dominantColor
            ? `linear-gradient(90deg, rgba(${dominantColor}, 0.18), rgba(12, 12, 14, 0.92))`
            : 'rgba(12, 12, 14, 0.92)',
          transition: 'background 800ms ease',
        }}
      >
        <div className="w-full max-w-5xl mx-auto h-full flex items-center gap-3 sm:gap-4">
          {/* Track info con Animación sutil */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg border border-white/10"
            >
              {currentTrack.cover ? (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/40 text-xs font-mono">♪</div>
              )}
            </motion.div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <p className="text-sm sm:text-[15px] font-bold text-[#F5F5F0] truncate tracking-tight">
                {currentTrack.title}
              </p>
              <p className="text-xs sm:text-[13px] text-[#A0A098] truncate font-medium mt-0.5">
                {currentTrack.artist}
              </p>
            </div>
          </div>

          {/* Play/Pause - Micro-interacciones Spring */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-[var(--accent-primary)] text-[#080808] flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-lg active:opacity-90 transition-colors duration-300"
            style={{
              boxShadow: isPlaying && !isLoading ? '0 8px 24px var(--accent-glow)' : '0 4px 12px rgba(0,0,0,0.4)',
            }}
            disabled={isLoading}
            aria-label={isLoading ? t('loading') : isPlaying ? t('pause') : t('play')}
          >
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Loader2 className="w-5 h-5 animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div key="pause" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                  <Pause className="w-5 h-5 fill-current" />
                </motion.div>
              ) : (
                <motion.div key="play" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Time + Volume (Desktop) */}
          <div className="hidden sm:flex items-center gap-3.5 min-w-[200px] justify-end">
            <span className="text-[11px] font-mono text-[#A0A098] tabular-nums tracking-wide">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              className="text-[#A0A098] hover:text-[#F5F5F0] transition-colors p-1"
            >
              {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </motion.button>
            <div
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(volume * 100)}
              className="w-20 h-3 flex items-center cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}
            >
              <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white group-hover:bg-[var(--accent-primary)] rounded-full transition-all"
                  style={{ width: `${volume * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
