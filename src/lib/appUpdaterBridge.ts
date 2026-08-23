import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  ANDROID_PACKAGE_NAME,
  type AppUpdateResult,
  type DownloadedAndroidApk,
  type InspectedAndroidApk,
  type InstalledAndroidBuild,
  type InstalledDesktopBuild,
} from '@/types/appUpdate';

interface NativeAppUpdateError {
  code: string;
  detail: string;
}

type NativeAppUpdateResult<T> =
  | { success: true; data: T }
  | { success: false; error: NativeAppUpdateError };

interface AppUpdaterPlugin {
  getInstalledIdentity(): Promise<NativeAppUpdateResult<InstalledAndroidBuild>>;
  inspectDownloadedApk(options: { path: string }): Promise<NativeAppUpdateResult<InspectedAndroidApk>>;
  downloadUpdate(options: {
    url: string;
    assetName: string;
    expectedDigest: string;
    expectedSize: number;
    eligibleAtMs: number;
    trustedTimeMs: number;
  }): Promise<NativeAppUpdateResult<DownloadedAndroidApk>>;
  cancelDownload(): Promise<NativeAppUpdateResult<{ cancelled: boolean }>>;
  canInstallPackages(): Promise<NativeAppUpdateResult<{ allowed: boolean }>>;
  openInstallPermissionSettings(): Promise<NativeAppUpdateResult<{ opened: boolean }>>;
  installUpdate(options: {
    path: string;
    expectedDigest: string;
    expectedVersionName: string;
    expectedVersionCode: number;
    eligibleAtMs: number;
    trustedTimeMs: number;
  }): Promise<NativeAppUpdateResult<{ started: boolean }>>;
  addListener(
    eventName: 'updateDownloadProgress',
    listener: (event: { progress: number; downloadedBytes: number; totalBytes: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

export async function getInstalledAppIdentity(): Promise<AppUpdateResult<InstalledAndroidBuild>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        detail: 'Android app identity is only available on Android.',
      },
    };
  }

  try {
    const result = await AppUpdater.getInstalledIdentity();
    if (result.success === false) {
      return {
        success: false,
        error: {
          code: 'NATIVE_IDENTITY_FAILED',
          detail: result.error.detail,
        },
      };
    }
    if (result.data.packageName !== ANDROID_PACKAGE_NAME) {
      return {
        success: false,
        error: {
          code: 'PACKAGE_MISMATCH',
          detail: 'Installed Android package does not match MHL Music.',
        },
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NATIVE_IDENTITY_FAILED',
        detail: error instanceof Error ? error.message : 'Could not read installed Android identity.',
      },
    };
  }
}

export async function inspectDownloadedApk(
  path: string,
): Promise<AppUpdateResult<InspectedAndroidApk>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        detail: 'APK inspection is only available on Android.',
      },
    };
  }

  try {
    const result = await AppUpdater.inspectDownloadedApk({ path });
    if (result.success === false) {
      return {
        success: false,
        error: {
          code: 'APK_INSPECTION_FAILED',
          detail: result.error.detail,
        },
      };
    }
    if (result.data.packageName !== ANDROID_PACKAGE_NAME) {
      return {
        success: false,
        error: {
          code: 'PACKAGE_MISMATCH',
          detail: 'Downloaded APK package does not match MHL Music.',
        },
      };
    }
    if (!result.data.matchesInstalledCertificate) {
      return {
        success: false,
        error: {
          code: 'SIGNATURE_MISMATCH',
          detail: 'Downloaded APK is not signed by the installed MHL Music certificate.',
        },
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'APK_INSPECTION_FAILED',
        detail: error instanceof Error ? error.message : 'Could not inspect downloaded APK.',
      },
    };
  }
}

export async function downloadAndroidUpdate(options: {
  url: string;
  assetName: string;
  expectedDigest: string;
  expectedSize: number;
  eligibleAtMs: number;
  trustedTimeMs: number;
}): Promise<AppUpdateResult<DownloadedAndroidApk>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        detail: 'APK downloads are only available on Android.',
      },
    };
  }

  try {
    const result = await AppUpdater.downloadUpdate(options);
    if (result.success === true) return result;
    return {
      success: false,
      error: {
        code: result.error.code === 'SAFETY_PERIOD_ACTIVE'
          ? 'SAFETY_PERIOD_ACTIVE'
          : result.error.code === 'DOWNLOAD_CANCELLED'
            ? 'DOWNLOAD_CANCELLED'
          : result.error.code === 'CHECKSUM_MISMATCH'
            ? 'CHECKSUM_MISMATCH'
            : 'DOWNLOAD_FAILED',
        detail: result.error.detail,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DOWNLOAD_FAILED',
        detail: error instanceof Error ? error.message : 'Could not download Android update.',
      },
    };
  }
}

export async function cancelAndroidUpdateDownload(): Promise<AppUpdateResult<boolean>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        detail: 'APK download cancellation is only available on Android.',
      },
    };
  }

  try {
    const result = await AppUpdater.cancelDownload();
    return result.success === true
      ? { success: true, data: result.data.cancelled }
      : {
          success: false,
          error: { code: 'DOWNLOAD_FAILED', detail: result.error.detail },
        };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DOWNLOAD_FAILED',
        detail: error instanceof Error ? error.message : 'Could not cancel Android update download.',
      },
    };
  }
}

export async function addUpdateDownloadProgressListener(
  callback: (event: { progress: number; downloadedBytes: number; totalBytes: number }) => void,
): Promise<PluginListenerHandle | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  try {
    return await AppUpdater.addListener('updateDownloadProgress', callback);
  } catch {
    return null;
  }
}

export async function canInstallAndroidPackages(): Promise<AppUpdateResult<boolean>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: { code: 'UNSUPPORTED_PLATFORM', detail: 'Package installation is only available on Android.' },
    };
  }
  try {
    const result = await AppUpdater.canInstallPackages();
    return result.success === true
      ? { success: true, data: result.data.allowed }
      : {
          success: false,
          error: { code: 'INSTALL_FAILED', detail: result.error.detail },
        };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        detail: error instanceof Error ? error.message : 'Could not read Android install permission.',
      },
    };
  }
}

export async function openAndroidInstallPermissionSettings(): Promise<AppUpdateResult<boolean>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: { code: 'UNSUPPORTED_PLATFORM', detail: 'Install settings are only available on Android.' },
    };
  }
  try {
    const result = await AppUpdater.openInstallPermissionSettings();
    return result.success === true
      ? { success: true, data: result.data.opened }
      : {
          success: false,
          error: { code: 'INSTALL_FAILED', detail: result.error.detail },
        };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        detail: error instanceof Error ? error.message : 'Could not open Android install settings.',
      },
    };
  }
}

export async function installAndroidUpdate(options: {
  path: string;
  expectedDigest: string;
  expectedVersionName: string;
  expectedVersionCode: number;
  eligibleAtMs: number;
  trustedTimeMs: number;
}): Promise<AppUpdateResult<boolean>> {
  if (Capacitor.getPlatform() !== 'android') {
    return {
      success: false,
      error: { code: 'UNSUPPORTED_PLATFORM', detail: 'APK installation is only available on Android.' },
    };
  }
  try {
    const result = await AppUpdater.installUpdate(options);
    if (result.success === true) return { success: true, data: result.data.started };
    return {
      success: false,
      error: {
        code: result.error.code === 'INSTALL_PERMISSION_REQUIRED'
          ? 'INSTALL_PERMISSION_REQUIRED'
          : result.error.code === 'SAFETY_PERIOD_ACTIVE'
            ? 'SAFETY_PERIOD_ACTIVE'
            : 'INSTALL_FAILED',
        detail: result.error.detail,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        detail: error instanceof Error ? error.message : 'Could not start Android package installer.',
      },
    };
  }
}

export async function getInstalledDesktopIdentity(): Promise<AppUpdateResult<InstalledDesktopBuild>> {
  try {
    const isPyWebView = typeof window !== 'undefined' && 'pywebview' in window;
    if (isPyWebView && (window as any).pywebview?.api?.get_app_info) {
      const res = await (window as any).pywebview.api.get_app_info();
      if (res && res.success) {
        return {
          success: true,
          data: {
            platform: 'desktop',
            versionName: res.version || '1.5.4',
            frozen: !!res.frozen,
            appDir: res.app_dir || '',
          },
        };
      }
    }
    return {
      success: true,
      data: {
        platform: 'desktop',
        versionName: '1.5.4',
        frozen: false,
        appDir: '',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NATIVE_IDENTITY_FAILED',
        detail: error instanceof Error ? error.message : 'Could not read Desktop identity.',
      },
    };
  }
}

export async function applyDesktopUpdate(
  url: string,
  version: string,
): Promise<AppUpdateResult<{ started: boolean }>> {
  try {
    const isPyWebView = typeof window !== 'undefined' && 'pywebview' in window;
    if (!isPyWebView || !(window as any).pywebview?.api?.apply_desktop_update) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_PLATFORM',
          detail: 'Desktop auto-updater is only available in pywebview desktop runtime.',
        },
      };
    }

    const res = await (window as any).pywebview.api.apply_desktop_update(url, version);
    if (res && res.success) {
      return { success: true, data: { started: true } };
    }
    return {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        detail: res?.error || 'Desktop update failed to initiate.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INSTALL_FAILED',
        detail: error instanceof Error ? error.message : 'Could not apply Desktop update.',
      },
    };
  }
}

