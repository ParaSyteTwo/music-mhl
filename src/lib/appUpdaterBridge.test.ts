import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nativePlugin, capacitor } = vi.hoisted(() => ({
  nativePlugin: {
    getInstalledIdentity: vi.fn(),
    inspectDownloadedApk: vi.fn(),
    downloadUpdate: vi.fn(),
    cancelDownload: vi.fn(),
    addListener: vi.fn(),
    canInstallPackages: vi.fn(),
    openInstallPermissionSettings: vi.fn(),
    installUpdate: vi.fn(),
  },
  capacitor: {
    getPlatform: vi.fn(() => 'android'),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitor,
  registerPlugin: () => nativePlugin,
}));

import {
  applyDesktopUpdate,
  cancelAndroidUpdateDownload,
  downloadAndroidUpdate,
  getInstalledAppIdentity,
  getInstalledDesktopIdentity,
  inspectDownloadedApk,
  installAndroidUpdate,
} from './appUpdaterBridge';

const identity = {
  packageName: 'com.mhl.music',
  versionName: '1.3.5',
  versionCode: 13,
  digest: `sha256:${'a'.repeat(64)}`,
  signingCertificateDigests: [`sha256:${'b'.repeat(64)}`],
};

beforeEach(() => {
  vi.clearAllMocks();
  capacitor.getPlatform.mockReturnValue('android');
});

describe('app updater bridge', () => {
  it('does not call the native plugin outside Android', async () => {
    capacitor.getPlatform.mockReturnValue('web');
    await expect(getInstalledAppIdentity()).resolves.toMatchObject({
      success: false,
      error: { code: 'UNSUPPORTED_PLATFORM' },
    });
    expect(nativePlugin.getInstalledIdentity).not.toHaveBeenCalled();
  });

  it('returns the installed identity on Android', async () => {
    nativePlugin.getInstalledIdentity.mockResolvedValue({
      success: true,
      data: identity,
    });
    await expect(getInstalledAppIdentity()).resolves.toEqual({
      success: true,
      data: identity,
    });
  });

  it('rejects an APK signed by a different certificate', async () => {
    nativePlugin.inspectDownloadedApk.mockResolvedValue({
      success: true,
      data: {
        ...identity,
        digest: `sha256:${'c'.repeat(64)}`,
        matchesInstalledCertificate: false,
      },
    });
    await expect(inspectDownloadedApk('update.apk')).resolves.toMatchObject({
      success: false,
      error: { code: 'SIGNATURE_MISMATCH' },
    });
  });

  it('accepts an APK with the official package and installed certificate', async () => {
    const apk = {
      ...identity,
      digest: `sha256:${'c'.repeat(64)}`,
      matchesInstalledCertificate: true,
    };
    nativePlugin.inspectDownloadedApk.mockResolvedValue({
      success: true,
      data: apk,
    });
    await expect(inspectDownloadedApk('update.apk')).resolves.toEqual({
      success: true,
      data: apk,
    });
  });

  it('maps checksum download failures to a typed error', async () => {
    nativePlugin.downloadUpdate.mockResolvedValue({
      success: false,
      error: { code: 'CHECKSUM_MISMATCH', detail: 'Digest mismatch.' },
    });
    await expect(downloadAndroidUpdate({
      url: 'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-1.3.6.apk',
      assetName: 'MHL-Music-1.3.6.apk',
      expectedDigest: `sha256:${'a'.repeat(64)}`,
      expectedSize: 10,
      eligibleAtMs: 0,
      trustedTimeMs: 0,
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'CHECKSUM_MISMATCH' },
    });
  });

  it('cancels the native APK download explicitly', async () => {
    nativePlugin.cancelDownload.mockResolvedValue({
      success: true,
      data: { cancelled: true },
    });
    await expect(cancelAndroidUpdateDownload()).resolves.toEqual({
      success: true,
      data: true,
    });
    expect(nativePlugin.cancelDownload).toHaveBeenCalledOnce();
  });

  it('maps missing install permission without opening installation silently', async () => {
    nativePlugin.installUpdate.mockResolvedValue({
      success: false,
      error: {
        code: 'INSTALL_PERMISSION_REQUIRED',
        detail: 'Permission required.',
      },
    });
    await expect(installAndroidUpdate({
      path: 'update.apk',
      expectedDigest: `sha256:${'a'.repeat(64)}`,
      expectedVersionName: '1.3.6',
      expectedVersionCode: 14,
      eligibleAtMs: 0,
      trustedTimeMs: 0,
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'INSTALL_PERMISSION_REQUIRED' },
    });
  });

  describe('desktop update bridge', () => {
    it('returns baseline 1.0.0 for legacy pywebview runtime without get_app_info', async () => {
      // @ts-expect-error simulate pywebview without get_app_info
      window.pywebview = { api: {} };
      const identity = await getInstalledDesktopIdentity();
      expect(identity.success).toBe(true);
      if (identity.success) {
        expect(identity.data.versionName).toBe('1.0.0');
      }
      // @ts-expect-error cleanup
      delete window.pywebview;
    });

    it('returns actual version when get_app_info is provided', async () => {
      // @ts-expect-error simulate pywebview with get_app_info
      window.pywebview = {
        api: {
          get_app_info: vi.fn().mockResolvedValue({ success: true, version: '1.5.4', frozen: true, app_dir: 'C:\\app' }),
        },
      };
      const identity = await getInstalledDesktopIdentity();
      expect(identity.success).toBe(true);
      if (identity.success) {
        expect(identity.data.versionName).toBe('1.5.4');
      }
      // @ts-expect-error cleanup
      delete window.pywebview;
    });

    it('falls back to window.open when apply_desktop_update is not available on legacy pywebview', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      // @ts-expect-error simulate pywebview without apply_desktop_update
      window.pywebview = { api: {} };
      const result = await applyDesktopUpdate('https://github.com/test.zip', '1.5.5');
      expect(result.success).toBe(true);
      expect(openSpy).toHaveBeenCalledWith('https://github.com/test.zip', '_blank');
      openSpy.mockRestore();
      // @ts-expect-error cleanup
      delete window.pywebview;
    });
  });
});
