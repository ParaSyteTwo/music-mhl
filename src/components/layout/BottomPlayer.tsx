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

  // On mobile, offset by nav height + safe-area
  const bottomStyle = 'calc(var(--nav-height) + var(--sab))';

  if (!currentTrack) return null;

  return (
    <>
      {/* Progress bar */}
      <div
        className="fixed left-0 right-0 z-40"
        style={{ bottom: `calc(${bottomStyle} + var(--player-height))` }}
      >
        <div
          role="slider"
          aria-label={t('seek')}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration)}
          aria-valuenow={Math.min(progress, duration)}
          className="h-1 group cursor-pointer bg-[rgba(255,255,255,0.08)] transition-all duration-200 hover:h-[5px]"
          onMouseEnter={() => setHoverProgress(true)}
          onMouseLeave={() => setHoverProgress(false)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            seekTo(x * duration);
          }}
        >
          <div
            className="h-full"
            style={{
              background: 'linear-gradient(90deg, #C8F04B 0%, #8BC34A 100%)',
              transform: `scaleX(${Math.min(progressPercent, 100) / 100})`,
              transformOrigin: 'left',
              willChange: 'transform',
            }}
          />
          <AnimatePresence>
            {hoverProgress && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#C8F04B] shadow-lg"
                style={{
                  left: `${Math.min(progressPercent, 100)}%`,
                  marginLeft: -6,
                  boxShadow: '0 0 12px rgba(200, 240, 75, 0.5)',
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main player bar */}
      <div
        className="fixed left-0 right-0 bg-[rgba(8,8,8,0.95)] border-t border-[rgba(255,255,255,0.08)] z-40 flex items-center px-3 sm:px-5 gap-3"
        style={{
          bottom: bottomStyle,
          backdropFilter: 'blur(20px) saturate(180%)',
          height: 'var(--player-height)',
          background: dominantColor
            ? `linear-gradient(to right, rgba(${dominantColor}, 0.15), rgba(8, 8, 8, 0.95))`
            : 'rgba(8, 8, 8, 0.95)',
          transition: 'background 800ms ease',
        }}
      >
        {/* Track info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-md overflow-hidden flex-shrink-0 bg-[rgba(200,240,75,0.1)]">
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[13px] sm:text-sm font-semibold truncate"
              style={{
                color: dominantColor ? `rgb(${dominantColor})` : '#F5F5F0',
                transition: 'color 800ms ease',
              }}
            >{currentTrack.title}</p>
            <p className="text-[11px] sm:text-xs text-[#666660] truncate">{currentTrack.artist}</p>
          </div>
        </div>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-[#C8F04B] text-[#080808] flex items-center justify-center active:scale-95 hover:scale-105 transition-all flex-shrink-0"
          style={{
            boxShadow: isPlaying && !isLoading ? '0 0 20px rgba(200, 240, 75, 0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
          }}
          disabled={isLoading}
          aria-label={isLoading ? t('loading') : isPlaying ? t('pause') : t('play')}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>

        {/* Time + Volume — desktop only */}
        <div className="hidden sm:flex items-center gap-3 min-w-[160px] justify-end">
          <span className="text-[11px] text-[#555] tabular-nums">{formatTime(progress)} / {formatTime(duration)}</span>
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="text-[#666660] hover:text-[#F5F5F0] transition-colors"
            aria-label={volume > 0 ? t('mute') : t('unmute')}
          >
            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <div
            role="slider"
            aria-label={t('volume')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volume * 100)}
            className="w-16 h-1 bg-[rgba(255,255,255,0.08)] rounded-full cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setVolume((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className="h-full bg-[#C8F04B] rounded-full transition-all"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
