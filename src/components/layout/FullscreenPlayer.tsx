import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, ChevronDown, Repeat, Repeat1, Shuffle } from 'lucide-react';
import { useMusicStore, RepeatMode } from '@/store/musicStore';

interface FullscreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function FullscreenPlayer({ isOpen, onClose }: FullscreenPlayerProps) {
  const { player, togglePlay, setVolume, seekTo, toggleLyrics, skipNext, skipPrev, toggleShuffle, toggleRepeat } = useMusicStore();
  const { currentTrack, isPlaying, isLoading, volume, progress, duration, shuffle, repeat } = player;
  const [hoverProgress, setHoverProgress] = useState(false);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  if (!currentTrack) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Fullscreen Player Content */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-0 bg-[#080808] flex flex-col items-center justify-center p-6 overflow-hidden"
            style={{
              backgroundImage: currentTrack.cover ? `url('${currentTrack.cover}')` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Blurred background overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, rgba(8,8,8,0.95) 0%, rgba(8,8,8,0.85) 100%)',
                backdropFilter: 'blur(80px)',
              }}
            />

            {/* Close button top-right */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-10 w-12 h-12 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] flex items-center justify-center text-[#F5F5F0] transition-colors backdrop-blur-sm"
            >
              <ChevronDown size={24} />
            </button>

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-md w-full space-y-12">
              {/* Large Cover Art */}
              <motion.div
                layoutId="album-cover"
                className="w-80 h-80 rounded-3xl overflow-hidden shadow-2xl"
                style={{
                  boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(200,240,75,0.2)',
                }}
              >
                {currentTrack.cover ? (
                  <img
                    src={currentTrack.cover}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center text-6xl">
                    ♪
                  </div>
                )}
              </motion.div>

              {/* Track Info */}
              <div className="text-center space-y-3 w-full">
                <h2 className="font-syne text-4xl font-bold text-[#F5F5F0]">
                  {currentTrack.title}
                </h2>
                <p className="text-lg text-[#A0A0A0] font-dm-sans">
                  {currentTrack.artist}
                </p>

                {/* Heart / Library button */}
                <button className="mx-auto flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(200,240,75,0.1)] text-[#C8F04B] hover:bg-[rgba(200,240,75,0.2)] transition-colors">
                  <span className="text-2xl">♡</span>
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full space-y-2">
                <div
                  className="w-full h-1 group cursor-pointer bg-[rgba(255,255,255,0.08)] rounded-full transition-all duration-200 hover:h-2"
                  onMouseEnter={() => setHoverProgress(true)}
                  onMouseLeave={() => setHoverProgress(false)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    seekTo(x * duration);
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      background: 'linear-gradient(90deg, #C8F04B 0%, #8BC34A 100%)',
                      width: `${Math.min(progressPercent, 100)}%`,
                    }}
                  />
                  {hoverProgress && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#C8F04B]"
                      style={{
                        left: `${Math.min(progressPercent, 100)}%`,
                        marginLeft: -8,
                        boxShadow: '0 0 16px rgba(200, 240, 75, 0.6)',
                      }}
                    />
                  )}
                </div>

                {/* Time */}
                <div className="flex items-center justify-between px-2 text-xs text-[#666660] font-mono">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls - Large */}
              <div className="flex items-center justify-center gap-8 w-full">
                {/* Shuffle */}
                <button
                  onClick={toggleShuffle}
                  className={`transition-colors duration-150 ${
                    shuffle ? 'text-[#C8F04B] scale-110' : 'text-[#666660] hover:text-[#F5F5F0]'
                  }`}
                  title="Toggle shuffle"
                >
                  <Shuffle className="w-6 h-6" />
                </button>

                {/* Skip Prev */}
                <button
                  onClick={skipPrev}
                  className="text-[#A0A0A0] hover:text-[#F5F5F0] transition-colors duration-150"
                >
                  <SkipBack className="w-8 h-8" />
                </button>

                {/* Play/Pause - Extra Large */}
                <button
                  onClick={togglePlay}
                  className="w-20 h-20 rounded-full bg-[#C8F04B] text-[#080808] flex items-center justify-center hover:scale-110 transition-transform duration-200 shadow-2xl"
                  style={{
                    boxShadow: isPlaying ? '0 0 30px rgba(200, 240, 75, 0.6)' : '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10 fill-current" />
                  ) : (
                    <Play className="w-10 h-10 fill-current ml-1" />
                  )}
                </button>

                {/* Skip Next */}
                <button
                  onClick={skipNext}
                  className="text-[#A0A0A0] hover:text-[#F5F5F0] transition-colors duration-150"
                >
                  <SkipForward className="w-8 h-8" />
                </button>

                {/* Repeat */}
                <button
                  onClick={toggleRepeat}
                  className={`transition-colors duration-150 ${
                    repeat !== 'off' ? 'text-[#C8F04B] scale-110' : 'text-[#666660] hover:text-[#F5F5F0]'
                  }`}
                >
                  {repeat === 'one' ? (
                    <Repeat1 className="w-6 h-6" />
                  ) : (
                    <Repeat className="w-6 h-6" />
                  )}
                </button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-4 w-full px-8">
                <VolumeX size={20} className="text-[#666660]" />
                <div
                  className="flex-1 h-2 bg-[rgba(255,255,255,0.08)] rounded-full cursor-pointer group"
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
                <Volume2 size={20} className="text-[#666660]" />
              </div>

              {/* Bottom Buttons */}
              <div className="flex gap-6">
                {/* Lyrics */}
                <button
                  onClick={toggleLyrics}
                  className="text-[#666660] hover:text-[#C8F04B] transition-colors"
                  title="Show lyrics"
                >
                  <Mic2 className="w-6 h-6" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
