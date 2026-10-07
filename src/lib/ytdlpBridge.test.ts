import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getYtDlpVersion,
  updateYtDlp,
  isYtDlpVersionOutdated,
  checkAndAutoUpdateYtDlpIfOutdated,
} from './ytdlpBridge';

describe('ytdlpBridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
