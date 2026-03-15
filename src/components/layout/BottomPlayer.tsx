import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Mic2, Repeat, Repeat1, Shuffle, Loader2, Youtube, Radio, List } from 'lucide-react';
import { useMusicStore, RepeatMode } from '@/store/musicStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { QueuePanel } from '@/components/music/QueuePanel';
import { FullscreenPlayer } from './FullscreenPlayer';

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
  const [isExpanded, setIsExpanded] = useState(false);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      {/* Progress bar - Premium style */}
      <div
        className="fixed bottom-[var(--player-height)] left-0 right-0 h-1 group cursor-pointer bg-[rgba(255,255,255,0.08)] z-40 transition-all duration-200 hover:h-[5px]"
        onMouseEnter={() => setHoverProgress(true)}
        onMouseLeave={() => setHoverProgress(false)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          seekTo(x * duration);
        }}
      >
        {/* Progress fill with gradient */}
        <div
          className="h-full transition-all duration-100"
          style={{
            background: 'linear-gradient(90deg, #C8F04B 0%, #8BC34A 100%)',
            width: `${Math.min(progressPercent, 100)}%`,
          }}
        />
        {/* Thumb indicator */}
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

      {/* Main player */}
      <div className="fixed bottom-0 left-0 right-0 h-[var(--player-height)] bg-[rgba(8,8,8,0.95)] border-t border-[rgba(255,255,255,0.08)] z-40 flex flex-col" style={{ backdropFilter: 'blur(20px) saturate(180%)' }}>
        {/* Player content */}
        <div className="flex-1 flex items-center px-2 sm:px-4 gap-2 sm:gap-6">
          {/* LEFT SECTION - Track info (280px) */}
          <div className="hidden sm:flex items-center gap-3 w-[280px] min-w-0">
            {currentTrack ? (
              <>
                {/* Cover art with shadow - CLICKABLE for fullscreen */}
                <button
                  onClick={() => setIsExpanded(true)}
                  className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#C8F04B]/30 to-[#8BC34A]/10 flex-shrink-0 overflow-hidden hover:scale-105 transition-transform cursor-pointer"
                  style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                  title="Click to expand"
                >
                  {currentTrack.cover ? (
                    <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </button>

                {/* Track info - TITLE ALSO CLICKABLE */}
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setIsExpanded(true)}
                    className="text-sm font-semibold text-[#F5F5F0] truncate font-[family-name:Syne] hover:text-[#C8F04B] transition-colors text-left w-full"
                  >
                    {currentTrack.title}
                  </button>
                  <p className="text-xs text-[#666660] truncate">{currentTrack.artist}</p>

                  {/* Source badge */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {audioSource === 'youtube' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[rgba(255,77,109,0.1)] text-[#FF4D6D] font-mono">
                        <Youtube className="w-2.5 h-2.5" /> YT
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[rgba(200,240,75,0.1)] text-[#C8F04B] font-mono">
                        <Radio className="w-2.5 h-2.5" /> Preview
                      </span>
                    )}
                    {queue.length > 1 && (
                      <span className="text-[10px] text-[#333330] font-mono ml-auto">
                        {player.queueIndex + 1}/{queue.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Full button */}
                {audioSource === 'preview' && currentTrack && (
                  <button
                    onClick={() => playTrackWithYouTube(currentTrack)}
                    className="shrink-0 text-xs font-semibold px-2 py-1 rounded-lg bg-[#FF4D6D]/10 text-[#FF4D6D] hover:bg-[#FF4D6D]/20 transition-colors"
                    title="Play full version on YouTube"
                  >
                    Full
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-[#666660]">No track selected</p>
            )}
          </div>

          {/* CENTER SECTION - Controls */}
          <div className="flex-1 flex flex-col items-center gap-1.5">
            {/* Control buttons */}
            <div className="flex items-center gap-1 sm:gap-6">
              {/* Shuffle - hidden on mobile */}
              <button
                onClick={toggleShuffle}
                className={`hidden sm:block transition-colors duration-150 ${
                  shuffle ? 'text-[#C8F04B]' : 'text-[#666660] hover:text-[#F5F5F0]'
                }`}
                title="Toggle shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              {/* Skip Previous */}
              <button
                onClick={skipPrev}
                className="text-[#666660] hover:text-[#F5F5F0] transition-colors duration-150"
                title="Previous"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* Play/Pause - Main button with spring animation */}
              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-[#C8F04B] text-[#080808] flex items-center justify-center hover:scale-105 transition-all duration-200 flex-shrink-0 shadow-lg"
                style={{
                  boxShadow: isPlaying && !isLoading ? '0 0 20px rgba(200, 240, 75, 0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
                }}
                disabled={!currentTrack || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Skip Next */}
              <button
                onClick={skipNext}
                className="text-[#666660] hover:text-[#F5F5F0] transition-colors duration-150"
                title="Next"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              {/* Repeat - hidden on mobile */}
              <button
                onClick={toggleRepeat}
                className={`hidden sm:block transition-colors duration-150 ${
                  repeat !== 'off' ? 'text-[#C8F04B]' : 'text-[#666660] hover:text-[#F5F5F0]'
                }`}
                title={`Repeat: ${repeat === 'off' ? 'off' : repeat === 'all' ? 'all' : 'one'}`}
              >
                {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Time display */}
            <div className="flex items-center gap-2 text-[11px] text-[#333330] timer-font">
              <span>{formatTime(progress)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-[9px] text-[#FF4D6D]/80 font-mono truncate max-w-xs">{error}</p>
            )}
          </div>

          {/* RIGHT SECTION - Lyrics, Queue, Volume (200px) */}
          <div className="flex items-center gap-2 sm:gap-3 w-[200px] justify-end">
            {/* Queue button */}
            {queue.length > 0 && (
              <button
                onClick={() => setShowQueue(true)}
                className="relative text-[#666660] hover:text-[#F5F5F0] transition-colors duration-150"
                title="Show queue"
              >
                <List className="w-5 h-5" />
                {queue.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-[#C8F04B] text-[#080808] text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </button>
            )}

            {/* Lyrics button */}
            <button
              onClick={toggleLyrics}
              className={`transition-colors duration-150 ${
                player.showLyrics ? 'text-[#C8F04B]' : 'text-[#666660] hover:text-[#F5F5F0]'
              }`}
              title="Show lyrics"
            >
              <Mic2 className="w-5 h-5" />
            </button>

            {/* Mute button - hidden on mobile */}
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              className="text-[#666660] hover:text-[#F5F5F0] transition-colors hidden sm:block duration-150"
              title="Toggle mute"
            >
              {volume > 0 ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Volume slider - hidden on mobile */}
            <div
              className="w-20 h-1 bg-[rgba(255,255,255,0.08)] rounded-full cursor-pointer hidden sm:block group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume((e.clientX - rect.left) / rect.width);
              }}
              title="Adjust volume"
            >
              <div
                className="h-full bg-[#C8F04B] rounded-full group-hover:shadow-lg transition-all"
                style={{ width: `${volume * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Queue Panel */}
      <QueuePanel isOpen={showQueue} onClose={() => setShowQueue(false)} />

      {/* Fullscreen Player */}
      <FullscreenPlayer isOpen={isExpanded} onClose={() => setIsExpanded(false)} />
    </>
  );
}
