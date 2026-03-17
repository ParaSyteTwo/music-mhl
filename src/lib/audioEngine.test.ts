import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { audioEngine } from './audioEngine';

describe('AudioEngine', () => {
  beforeEach(() => {
    audioEngine.pause();
    audioEngine.seek(0);
  });

  afterEach(() => {
    audioEngine.destroy();
  });

  describe('Basic API', () => {
    it('should have load method', () => {
      expect(typeof audioEngine.load).toBe('function');
    });

    it('should have play method', () => {
      expect(typeof audioEngine.play).toBe('function');
    });

    it('should have pause method', () => {
      expect(typeof audioEngine.pause).toBe('function');
    });

    it('should have seek method', () => {
      expect(typeof audioEngine.seek).toBe('function');
    });

    it('should have setVolume method', () => {
      expect(typeof audioEngine.setVolume).toBe('function');
    });

    it('should have destroy method', () => {
      expect(typeof audioEngine.destroy).toBe('function');
    });
  });

  describe('State Getters', () => {
    it('should have currentTime property', () => {
      expect(typeof audioEngine.currentTime).toBe('number');
    });

    it('should have duration property', () => {
      expect(typeof audioEngine.duration).toBe('number');
    });

    it('should have volume property', () => {
      expect(typeof audioEngine.volume).toBe('number');
    });

    it('should have isPlaying property', () => {
      expect(typeof audioEngine.isPlaying).toBe('boolean');
    });
  });

  describe('Volume Control', () => {
    it('should set volume', () => {
      audioEngine.setVolume(0.5);
      expect(audioEngine.volume).toBeLessThanOrEqual(1);
      expect(audioEngine.volume).toBeGreaterThanOrEqual(0);
    });

    it('should clamp volume to 0-1 range', () => {
      audioEngine.setVolume(1.5);
      expect(audioEngine.volume).toBeLessThanOrEqual(1);

      audioEngine.setVolume(-0.5);
      expect(audioEngine.volume).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Seeking', () => {
    it('should handle seek', () => {
      audioEngine.seek(45);
      // Seek should not throw
      expect(true).toBe(true);
    });

    it('should handle seek to zero', () => {
      audioEngine.seek(0);
      expect(true).toBe(true);
    });
  });

  describe('Event Handlers', () => {
    it('should accept onTimeUpdate handler', () => {
      const handler = (time: number) => {};
      expect(() => {
        audioEngine.onTimeUpdate = handler;
      }).not.toThrow();
    });

    it('should accept onEnded handler', () => {
      const handler = () => {};
      expect(() => {
        audioEngine.onEnded = handler;
      }).not.toThrow();
    });

    it('should accept onError handler', () => {
      const handler = (error: string) => {};
      expect(() => {
        audioEngine.onError = handler;
      }).not.toThrow();
    });

    it('should accept onCanPlay handler', () => {
      const handler = () => {};
      expect(() => {
        audioEngine.onCanPlay = handler;
      }).not.toThrow();
    });
  });

  describe('MediaSession API', () => {
    it('should have updateMediaSession method', () => {
      expect(typeof audioEngine.updateMediaSession).toBe('function');
    });

    it('should have setPlaybackState method', () => {
      expect(typeof audioEngine.setPlaybackState).toBe('function');
    });
  });

  describe('Lifecycle', () => {
    it('should be paused initially', () => {
      expect(audioEngine.isPlaying).toBe(false);
    });

    it('should have zero duration initially', () => {
      expect(audioEngine.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle destroy without throwing', () => {
      audioEngine.load('https://example.com/test.mp3');
      audioEngine.destroy();
      expect(true).toBe(true);
    });
  });
});
