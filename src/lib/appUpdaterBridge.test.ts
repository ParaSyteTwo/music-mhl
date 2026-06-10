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
  cancelAndroidUpdateDownload,
  downloadAndroidUpdate,
  getInstalledAppIdentity,
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
});
