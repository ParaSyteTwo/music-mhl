// Singleton audio engine using HTML5 Audio
class AudioEngine {
  private audio: HTMLAudioElement;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _onLoadStart: (() => void) | null = null;
  private _onCanPlay: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

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

  destroy() {
    this.audio.pause();
    this.audio.src = '';
    this.audio.removeAttribute('src');
  }
}

// Singleton
export const audioEngine = new AudioEngine();
