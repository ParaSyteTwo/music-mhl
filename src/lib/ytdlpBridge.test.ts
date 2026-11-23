import { describe, it, expect, vi, beforeEach } from 'vitest';

const capacitorMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  plugin: {
    initialize: vi.fn(async () => ({ success: true })),
    update: vi.fn(async () => ({ success: true, status: 'DONE' })),
    getVersion: vi.fn(async () => ({ success: true, version: '2026.08.19' })),
    search: vi.fn(async () => ({ success: true, results: [] })),
    getPlaylistItems: vi.fn(),
    downloadAudio: vi.fn(),
    cleanupTempAudio: vi.fn(async () => ({ success: true })),
    saveTaggedAudioToMusic: vi.fn(),
    tagAndSaveM4A: vi.fn(),
    addListener: vi.fn(),
    startForegroundService: vi.fn(),
    stopForegroundService: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitorMocks.isNativePlatform,
  },
  registerPlugin: vi.fn(() => capacitorMocks.plugin),
}));

import {
  getYtDlpVersion,
  updateYtDlp,
  isYtDlpVersionOutdated,
  checkAndAutoUpdateYtDlpIfOutdated,
  downloadAudioToTempNative,
  cleanupTempAudioNative,
  tagAndSaveM4A,
  getPlaylistItemsNative,
} from './ytdlpBridge';

describe('ytdlpBridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    capacitorMocks.isNativePlatform.mockReturnValue(true);
    capacitorMocks.plugin.initialize.mockResolvedValue({ success: true });
    capacitorMocks.plugin.cleanupTempAudio.mockResolvedValue({ success: true });
    delete (window as unknown as { pywebview?: unknown }).pywebview;
  });

  describe('isYtDlpVersionOutdated', () => {
    it('returns false for unknown or empty versions', () => {
      expect(isYtDlpVersionOutdated('')).toBe(false);
      expect(isYtDlpVersionOutdated('unknown')).toBe(false);
      expect(isYtDlpVersionOutdated('invalid-string')).toBe(false);
    });

    it('identifies outdated versions older than threshold', () => {
      expect(isYtDlpVersionOutdated('2020.01.01', 30)).toBe(true);
      expect(isYtDlpVersionOutdated('2023.05.10', 30)).toBe(true);
    });

    it('identifies fresh versions within threshold', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}.${month}.${day}`;
      expect(isYtDlpVersionOutdated(todayStr, 30)).toBe(false);
    });
  });

  describe('Desktop pywebview integration', () => {
    it('delegates getYtDlpVersion to pywebview api when running on desktop', async () => {
      const mockGetVersion = vi.fn().mockResolvedValue({ success: true, version: '2026.08.19' });
      (window as unknown as { pywebview: { api: { ytdlp_get_version: typeof mockGetVersion } } }).pywebview = {
        api: { ytdlp_get_version: mockGetVersion },
      };

      const version = await getYtDlpVersion();
      expect(version).toBe('2026.08.19');
      expect(mockGetVersion).toHaveBeenCalledTimes(1);
    });

    it('delegates updateYtDlp to pywebview api when running on desktop', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ success: true, status: 'DONE', version: '2026.08.19' });
      (window as unknown as { pywebview: { api: { ytdlp_update: typeof mockUpdate } } }).pywebview = {
        api: { ytdlp_update: mockUpdate },
      };

      const status = await updateYtDlp();
      expect(status).toBe('DONE');
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkAndAutoUpdateYtDlpIfOutdated', () => {
    it('automatically updates if version is older than 30 days', async () => {
      const mockGetVersion = vi.fn().mockResolvedValue({ success: true, version: '2023.01.01' });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true, status: 'DONE', version: '2026.08.19' });
      (window as unknown as { pywebview: { api: { ytdlp_get_version: typeof mockGetVersion; ytdlp_update: typeof mockUpdate } } }).pywebview = {
        api: {
          ytdlp_get_version: mockGetVersion,
          ytdlp_update: mockUpdate,
        },
      };

      const updated = await checkAndAutoUpdateYtDlpIfOutdated();
      expect(updated).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not trigger update if version is fresh', async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      const mockGetVersion = vi.fn().mockResolvedValue({ success: true, version: todayStr });
      const mockUpdate = vi.fn();
      (window as unknown as { pywebview: { api: { ytdlp_get_version: typeof mockGetVersion; ytdlp_update: typeof mockUpdate } } }).pywebview = {
        api: {
          ytdlp_get_version: mockGetVersion,
          ytdlp_update: mockUpdate,
        },
      };

      const updated = await checkAndAutoUpdateYtDlpIfOutdated();
      expect(updated).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Android zero-base64 temp audio bridge', () => {
    it('downloadAudioToTempNative passes skipBase64 and downloadId and returns tempPath metadata', async () => {
      capacitorMocks.plugin.downloadAudio.mockResolvedValue({
        success: true,
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a',
        fileName: 'audio_123.m4a',
        size: 409600,
      });

      const res = await downloadAudioToTempNative('dQw4w9WgXcQ', {
        expectedDuration: 212,
        format: 'm4a',
        downloadId: 'dl-42',
      });

      expect(capacitorMocks.plugin.downloadAudio).toHaveBeenCalledWith({
        videoId: 'dQw4w9WgXcQ',
        expectedDuration: 212,
        format: 'm4a',
        downloadId: 'dl-42',
        skipBase64: true,
      });
      expect(res).toEqual({
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a',
        fileName: 'audio_123.m4a',
        size: 409600,
      });
    });

    it('downloadAudioToTempNative supports sourceUrl when videoId is null', async () => {
      capacitorMocks.plugin.downloadAudio.mockResolvedValue({
        success: true,
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-2/audio_456.m4a',
        size: 512000,
      });

      const res = await downloadAudioToTempNative(null, {
        sourceUrl: 'https://a.animethemes.moe/Test-OP1.ogg',
        downloadId: 'dl-anime-1',
      });

      expect(capacitorMocks.plugin.downloadAudio).toHaveBeenCalledWith({
        sourceUrl: 'https://a.animethemes.moe/Test-OP1.ogg',
        downloadId: 'dl-anime-1',
        skipBase64: true,
      });
      expect(res).toEqual({
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-2/audio_456.m4a',
        size: 512000,
      });
    });

    it('downloadAudioToTempNative throws when native plugin omits tempPath', async () => {
      capacitorMocks.plugin.downloadAudio.mockResolvedValue({
        success: true,
        size: 0,
      });

      await expect(downloadAudioToTempNative('dQw4w9WgXcQ')).rejects.toThrow(
        'Download failed: no tempPath returned from native plugin',
      );
    });

    it('cleanupTempAudioNative delegates tempPath cleanup to native plugin', async () => {
      const tempPath = '/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a';
      await cleanupTempAudioNative(tempPath);

      expect(capacitorMocks.plugin.cleanupTempAudio).toHaveBeenCalledWith({ tempPath });
    });

    it('cleanupTempAudioNative is a no-op when tempPath is empty or non-native', async () => {
      await cleanupTempAudioNative('');
      expect(capacitorMocks.plugin.cleanupTempAudio).not.toHaveBeenCalled();

      capacitorMocks.isNativePlatform.mockReturnValue(false);
      await cleanupTempAudioNative('/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a');
      expect(capacitorMocks.plugin.cleanupTempAudio).not.toHaveBeenCalled();
    });

    it('cleanupTempAudioNative swallows native errors safely', async () => {
      capacitorMocks.plugin.cleanupTempAudio.mockRejectedValue(new Error('Invalid tempPath'));

      await expect(
        cleanupTempAudioNative('/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a'),
      ).resolves.toBeUndefined();
    });

    it('tagAndSaveM4A supports tempPath without base64 data', async () => {
      capacitorMocks.plugin.tagAndSaveM4A.mockResolvedValue({
        success: true,
        uri: 'content://media/external/audio/media/99',
      });

      const uri = await tagAndSaveM4A({
        fileName: 'Song - Artist.m4a',
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a',
        title: 'Song',
        artist: 'Artist',
      });

      expect(capacitorMocks.plugin.tagAndSaveM4A).toHaveBeenCalledWith({
        fileName: 'Song - Artist.m4a',
        tempPath: '/data/user/0/com.mhl.music/cache/ytdlp/uuid-1/audio_123.m4a',
        title: 'Song',
        artist: 'Artist',
      });
      expect(uri).toBe('content://media/external/audio/media/99');
    });

    it('tagAndSaveM4A remains retrocompatible with base64 data', async () => {
      capacitorMocks.plugin.tagAndSaveM4A.mockResolvedValue({
        success: true,
        uri: 'content://media/external/audio/media/100',
      });

      const uri = await tagAndSaveM4A({
        fileName: 'Legacy - Artist.m4a',
        data: 'AAAA',
        title: 'Legacy',
      });

      expect(capacitorMocks.plugin.tagAndSaveM4A).toHaveBeenCalledWith({
        fileName: 'Legacy - Artist.m4a',
        data: 'AAAA',
        title: 'Legacy',
      });
      expect(uri).toBe('content://media/external/audio/media/100');
    });

    it('tagAndSaveM4A rejects when neither tempPath nor data is provided', async () => {
      await expect(
        tagAndSaveM4A({
          fileName: 'Empty.m4a',
        }),
      ).rejects.toThrow('tagAndSaveM4A requires either tempPath or data');
      expect(capacitorMocks.plugin.tagAndSaveM4A).not.toHaveBeenCalled();
    });
  });

  describe('getPlaylistItemsNative', () => {
    it('returns playlist title and items on success with default limit 50', async () => {
      const playlistUrl = 'https://www.youtube.com/playlist?list=PL1234567890abcdef';
      capacitorMocks.plugin.getPlaylistItems.mockResolvedValue({
        success: true,
        title: 'Anime Classics',
        items: [
          {
            videoId: 'abc12345678',
            title: 'Unravel',
            channel: 'TK from Ling tosite sigure',
            duration: 240,
            thumbnail: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
          },
        ],
      });

      const res = await getPlaylistItemsNative(playlistUrl);

      expect(capacitorMocks.plugin.getPlaylistItems).toHaveBeenCalledWith({
        url: playlistUrl,
        limit: 50,
      });
      expect(res).toEqual({
        title: 'Anime Classics',
        items: [
          {
            videoId: 'abc12345678',
            title: 'Unravel',
            channel: 'TK from Ling tosite sigure',
            duration: 240,
            thumbnail: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
          },
        ],
      });
    });

    it('passes custom limit and clamps out-of-range limits between 1 and 50', async () => {
      const playlistUrl = 'https://music.youtube.com/playlist?list=OLAK5uy_12345678';
      capacitorMocks.plugin.getPlaylistItems.mockResolvedValue({
        success: true,
        title: 'OST',
        items: [],
      });

      await getPlaylistItemsNative(playlistUrl, 20);
      expect(capacitorMocks.plugin.getPlaylistItems).toHaveBeenLastCalledWith({
        url: playlistUrl,
        limit: 20,
      });

      await getPlaylistItemsNative(playlistUrl, 999);
      expect(capacitorMocks.plugin.getPlaylistItems).toHaveBeenLastCalledWith({
        url: playlistUrl,
        limit: 50,
      });

      await getPlaylistItemsNative(playlistUrl, 0);
      expect(capacitorMocks.plugin.getPlaylistItems).toHaveBeenLastCalledWith({
        url: playlistUrl,
        limit: 1,
      });
    });

    it('rejects when native plugin returns success: false', async () => {
      capacitorMocks.plugin.getPlaylistItems.mockResolvedValue({
        success: false,
        title: '',
        items: [],
      });

      await expect(
        getPlaylistItemsNative('https://www.youtube.com/playlist?list=PL1234567890abcdef'),
      ).rejects.toThrow('Failed to fetch YouTube playlist items');
    });

    it('rejects on non-native platform without calling plugin', async () => {
      capacitorMocks.isNativePlatform.mockReturnValue(false);

      await expect(
        getPlaylistItemsNative('https://www.youtube.com/playlist?list=PL1234567890abcdef'),
      ).rejects.toThrow('Not on native platform');
      expect(capacitorMocks.plugin.getPlaylistItems).not.toHaveBeenCalled();
    });

    it('rejects on timeout after 30_000 ms', async () => {
      vi.useFakeTimers();
      try {
        capacitorMocks.plugin.getPlaylistItems.mockReturnValue(new Promise(() => {}));
        const promise = getPlaylistItemsNative('https://www.youtube.com/playlist?list=PL1234567890abcdef');
        const expectation = expect(promise).rejects.toThrow('Playlist fetch timeout');
        await vi.advanceTimersByTimeAsync(30_000);
        await expectation;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
