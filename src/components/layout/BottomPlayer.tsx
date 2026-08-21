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
  const { currentTrack, isPlaying, isLoading, volume, progress, duration, togglePlay, setVolume, seekTo, dominantColor } = useMusicStore();
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

      {/* Progress bar con Micro-interacciones */}
      <div
        className="fixed left-0 right-0 z-50 group"
        style={{ bottom: `calc(${bottomStyle} + var(--player-height))` }}
      >
        <div
          role="slider"
          aria-label={t('seek')}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration)}
          aria-valuenow={Math.min(progress, duration)}
          className="h-1.5 cursor-pointer bg-white/10 transition-all duration-300 hover:h-2.5 relative"
          onMouseEnter={() => setHoverProgress(true)}
          onMouseLeave={() => setHoverProgress(false)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            seekTo(x * duration);
          }}
        >
          <motion.div
            className="h-full rounded-r-full"
            style={{
              background: 'linear-gradient(90deg, #C8F04B 0%, #8BC34A 100%)',
              width: `${Math.min(progressPercent, 100)}%`,
              boxShadow: hoverProgress ? '0 0 15px rgba(200, 240, 75, 0.6)' : 'none',
            }}
            layout
          />
          <AnimatePresence>
            {hoverProgress && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg"
                style={{
                  left: `${Math.min(progressPercent, 100)}%`,
                  marginLeft: -7,
                  boxShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(200, 240, 75, 0.6)',
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main player bar - Glassmorphism Mejorado */}
      <div
        className="fixed left-0 right-0 border-t border-white/5 z-40 flex items-center px-4 sm:px-6 gap-4"
        style={{
          bottom: bottomStyle,
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          height: 'var(--player-height)',
          background: dominantColor
            ? `linear-gradient(90deg, rgba(${dominantColor}, 0.15), rgba(10, 10, 12, 0.85))`
            : 'rgba(10, 10, 12, 0.85)',
          transition: 'background 1s ease',
        }}
      >
        {/* Track info con Animación sutil */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-lg"
          >
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/5" />
            )}
          </motion.div>
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <motion.p
              layoutId="track-title"
              className="text-sm sm:text-[15px] font-bold truncate tracking-tight"
              style={{ color: '#F5F5F0' }}
            >{currentTrack.title}</motion.p>
            <p className="text-xs sm:text-[13px] text-white/60 truncate font-medium">{currentTrack.artist}</p>
          </div>
        </div>

        {/* Play/Pause - Micro-interacciones Spring */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-[#C8F04B] text-[#080808] flex items-center justify-center flex-shrink-0 relative overflow-hidden"
          style={{
            boxShadow: isPlaying && !isLoading ? '0 8px 24px rgba(200, 240, 75, 0.3)' : '0 4px 12px rgba(0,0,0,0.3)',
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
                <Play className="w-5 h-5 fill-current ml-1" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Time + Volume (Desktop) */}
        <div className="hidden sm:flex items-center gap-4 min-w-[180px] justify-end">
          <span className="text-[12px] text-white/50 font-medium tabular-nums tracking-wider">{formatTime(progress)} / {formatTime(duration)}</span>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="text-white/60 hover:text-white transition-colors"
          >
            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </motion.button>
          <div
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volume * 100)}
            className="w-20 h-1.5 bg-white/10 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setVolume((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className="h-full bg-white group-hover:bg-[#C8F04B] rounded-full transition-all"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
