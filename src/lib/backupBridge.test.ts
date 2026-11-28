import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  writeFile: vi.fn(),
  isPyWebView: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: mocks.writeFile },
}));

vi.mock('@/lib/platform', () => ({
  get isPyWebView() {
    return mocks.isPyWebView();
  },
}));

import {
  exportAppBackup,
  importAppBackupDesktop,
  parseAndValidateBackup,
} from './backupBridge';

describe('backupBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.isPyWebView.mockReturnValue(false);
    delete (window as { pywebview?: unknown }).pywebview;
  });

  it('validates backup JSON structure and counts downloads', () => {
    expect(parseAndValidateBackup('bad json')).toEqual({ valid: false, reason: 'corrupt' });
    expect(parseAndValidateBackup(JSON.stringify({ state: {} }))).toEqual({
      valid: false,
      reason: 'invalid',
    });

    const ok = parseAndValidateBackup(
      JSON.stringify({ state: { downloads: [{ id: 'dz-1' }, { id: 'dz-2' }] } }),
    );
    expect(ok).toEqual({
      valid: true,
      normalized: '{"state":{"downloads":[{"id":"dz-1"},{"id":"dz-2"}]}}',
      trackCount: 2,
    });
  });

  it('exports and imports via Desktop pywebview native bridge', async () => {
    mocks.isPyWebView.mockReturnValue(true);
    const export_backup = vi.fn().mockResolvedValue({
      success: true,
      filePath: 'C:/Users/Paul/Documents/MHL Music/mhl-music-backup.json',
      fileName: 'mhl-music-backup.json',
    });
    const import_backup = vi.fn().mockResolvedValue({
      success: true,
      data: '{"state":{"downloads":[]}}',
      filePath: 'C:/Users/Paul/Documents/MHL Music/mhl-music-backup.json',
    });
    (window as unknown as { pywebview: { api: unknown } }).pywebview = {
      api: { export_backup, import_backup },
    };

    const exp = await exportAppBackup('{"state":{"downloads":[]}}');
    expect(exp.success).toBe(true);
    expect(exp.location).toContain('MHL Music');
    expect(export_backup).toHaveBeenCalledTimes(1);

    const imp = await importAppBackupDesktop();
    expect(imp).toEqual({
      success: true,
      data: '{"state":{"downloads":[]}}',
      location: 'C:/Users/Paul/Documents/MHL Music/mhl-music-backup.json',
    });
  });

  it('writes backup JSON to Android Directory.Documents/MHL Music via Filesystem', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'content://docs/mhl-backup.json' });

    const res = await exportAppBackup('{"state":{"downloads":[]}}');
    expect(res.success).toBe(true);
    expect(res.location).toMatch(/^Documentos\/MHL Music\/mhl-music-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: 'DOCUMENTS',
        encoding: 'utf8',
        recursive: true,
        path: expect.stringMatching(/^MHL Music\/mhl-music-backup-\d{4}-\d{2}-\d{2}\.json$/),
      }),
    );
  });
});
