// Singleton audio engine using HTML5 Audio
class AudioEngine {
  private audio: HTMLAudioElement;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _onLoadStart: (() => void) | null = null;
  private _onCanPlay: (() => void) | null = null;
  private _onPlay: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;
  private _onPlayControlPressed: (() => void) | null = null;
  private _onPauseControlPressed: (() => void) | null = null;
  private _onNextControlPressed: (() => void) | null = null;
  private _onPrevControlPressed: (() => void) | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';

    this.audio.addEventListener('timeupdate', () => {
      this._onTimeUpdate?.(this.audio.currentTime);
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

    this.audio.addEventListener('play', () => {
      this._onPlay?.();
    });

    this.audio.addEventListener('error', () => {
      const err = this.audio.error;
      let errorMsg = 'Error al reproducir audio';

      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = 'Reproducción cancelada';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = 'Error de red — verifica tu conexión';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = 'Formato no soportado o archivo corrupto';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = 'Formato no soportado por tu navegador';
            break;
          default:
            errorMsg = err.message || 'Error desconocido al reproducir';
        }
      }

      this._onError?.(errorMsg);
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

  set onPlay(fn: (() => void) | null) {
    this._onPlay = fn;
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

  // MediaSession API for background playback & lock screen controls
  updateMediaSession(metadata: {
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
  }) {
    if (!('mediaSession' in navigator)) return;

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
      this._onPlayControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
      this._onPauseControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this._onNextControlPressed?.();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this._onPrevControlPressed?.();
    });

    navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
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
