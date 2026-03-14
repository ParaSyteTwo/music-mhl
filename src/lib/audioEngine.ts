// Media Session handlers type
interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onSeekTo?: (time: number) => void;
  onSeekBackward?: (seconds?: number) => void;
  onSeekForward?: (seconds?: number) => void;
}

// Singleton audio engine using HTML5 Audio
class AudioEngine {
  private audio: HTMLAudioElement;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _onLoadStart: (() => void) | null = null;
  private _onCanPlay: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;
  private _onPlayControlPressed: (() => void) | null = null;
  private _onPauseControlPressed: (() => void) | null = null;
  private _onNextControlPressed: (() => void) | null = null;
  private _onPrevControlPressed: (() => void) | null = null;
  private mediaSessionHandlers: MediaSessionHandlers = {};

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';

    // Prevent browser from freezing audio playback in background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App is backgrounded, but HTMLAudioElement continues playing
      } else {
        // App is foregrounded
        if (this.isPlaying && !this.audio.paused) {
          this.audio.play().catch(() => {
            // Play might fail on some browsers when returning from background
          });
        }
      }
    });

    // Sync MediaSession playback state with audio element events
    this.audio.addEventListener('play', () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    });

    this.audio.addEventListener('pause', () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      this._onTimeUpdate?.(this.audio.currentTime);
      
      // Sync with MediaSession API for lock screen progress
      if ('mediaSession' in navigator && isFinite(this.audio.duration)) {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate,
          position: this.audio.currentTime,
        });
      }
    });

    this.audio.addEventListener('ended', () => {
      this._onEnded?.();
    });

    this.audio.addEventListener('loadstart', () => {
      this._onLoadStart?.();
    });

    this.audio.addEventListener('canplay', () => {
      this._onCanPlay?.();
    });

    this.audio.addEventListener('error', () => {
      const err = this.audio.error;
      this._onError?.(err?.message || 'Audio playback error');
    });
  }

  load(url: string) {
    this.audio.src = url;
    this.audio.load();
  }

  play() {
    return this.audio.play().catch((e) => {
      console.warn('Audio play failed:', e.message);
    });
  }

  pause() {
    this.audio.pause();
  }

  seek(time: number) {
    if (isFinite(time) && time >= 0) {
      this.audio.currentTime = time;
    }
  }

  setVolume(volume: number) {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  get currentTime() {
    return this.audio.currentTime;
  }

  get duration() {
    return isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  get isPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }

  get volume() {
    return this.audio.volume;
  }

  // Event setters
  set onTimeUpdate(fn: ((time: number) => void) | null) {
    this._onTimeUpdate = fn;
  }

  set onEnded(fn: (() => void) | null) {
    this._onEnded = fn;
  }

  set onLoadStart(fn: (() => void) | null) {
    this._onLoadStart = fn;
  }

  set onCanPlay(fn: (() => void) | null) {
    this._onCanPlay = fn;
  }

  set onError(fn: ((error: string) => void) | null) {
    this._onError = fn;
  }

  set onPlayControlPressed(fn: (() => void) | null) {
    this._onPlayControlPressed = fn;
  }

  set onPauseControlPressed(fn: (() => void) | null) {
    this._onPauseControlPressed = fn;
  }

  set onNextControlPressed(fn: (() => void) | null) {
    this._onNextControlPressed = fn;
  }

  set onPrevControlPressed(fn: (() => void) | null) {
    this._onPrevControlPressed = fn;
  }

  // Set handlers for MediaSession button presses
  setMediaSessionHandlers(handlers: MediaSessionHandlers) {
    this.mediaSessionHandlers = handlers;
  }

  // MediaSession API for background playback & lock screen controls
  updateMediaSession(
    metadata: {
      title: string;
      artist: string;
      album?: string;
      artwork?: string;
    },
    handlers?: MediaSessionHandlers
  ) {
    if (!('mediaSession' in navigator)) return;

    if (handlers) {
      this.setMediaSessionHandlers(handlers);
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album || 'Music',
      artwork: metadata.artwork
        ? [
            {
              src: metadata.artwork,
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ]
        : undefined,
    });

    navigator.mediaSession.setActionHandler('play', () => {
      this.play();
      this.mediaSessionHandlers.onPlay?.();
      this._onPlayControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
      this.mediaSessionHandlers.onPause?.();
      this._onPauseControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.mediaSessionHandlers.onNextTrack?.();
      this._onNextControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.mediaSessionHandlers.onPreviousTrack?.();
      this._onPrevControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('seekto', (event) => {
      if (event.seekTime !== undefined) {
        this.seek(event.seekTime);
        this.mediaSessionHandlers.onSeekTo?.(event.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (event) => {
      const skipTime = event.seekOffset || 5; // default 5 seconds
      this.seek(Math.max(0, this.audio.currentTime - skipTime));
      this.mediaSessionHandlers.onSeekBackward?.(skipTime);
    });

    navigator.mediaSession.setActionHandler('seekforward', (event) => {
      const skipTime = event.seekOffset || 5; // default 5 seconds
      this.seek(Math.min(this.audio.duration, this.audio.currentTime + skipTime));
      this.mediaSessionHandlers.onSeekForward?.(skipTime);
    });

    navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
  }

  clearMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    }
    this.mediaSessionHandlers = {};
  }

  setPlaybackState(state: 'playing' | 'paused') {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  destroy() {
    this.audio.pause();
    this.audio.src = '';
    this.audio.removeAttribute('src');
  }
}

// Singleton
export const audioEngine = new AudioEngine();
