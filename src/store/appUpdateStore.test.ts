import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledAndroidBuild, RemoteAndroidBuild } from '@/types/appUpdate';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => 'android'),
  identity: vi.fn(),
  release: vi.fn(),
  download: vi.fn(),
  cancelDownload: vi.fn(),
  inspect: vi.fn(),
  addProgressListener: vi.fn(),
  install: vi.fn(),
  canInstall: vi.fn(),
  openInstallSettings: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: mocks.platform },
}));
vi.mock('@/lib/appUpdaterBridge', () => ({
  getInstalledAppIdentity: mocks.identity,
  downloadAndroidUpdate: mocks.download,
  cancelAndroidUpdateDownload: mocks.cancelDownload,
  inspectDownloadedApk: mocks.inspect,
  addUpdateDownloadProgressListener: mocks.addProgressListener,
  installAndroidUpdate: mocks.install,
  canInstallAndroidPackages: mocks.canInstall,
  openAndroidInstallPermissionSettings: mocks.openInstallSettings,
}));
vi.mock('@/lib/githubAndroidRelease', () => ({
  fetchLatestOfficialAndroidRelease: mocks.release,
}));

import { useAppUpdateStore } from './appUpdateStore';

const installed: InstalledAndroidBuild = {
  packageName: 'com.mhl.music',
  versionName: '1.3.5',
  versionCode: 13,
  digest: `sha256:${'a'.repeat(64)}`,
  signingCertificateDigests: [`sha256:${'b'.repeat(64)}`],
};

const build: RemoteAndroidBuild = {
  channel: 'stable',
  releaseId: 10,
  releaseTag: 'v1.3.6',
  releaseUrl: 'https://github.com/ParaSyteTwo/music-mhl/releases/tag/v1.3.6',
  assetId: 20,
  assetName: 'MHL-Music-1.3.6.apk',
  assetUrl:
    'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-1.3.6.apk',
  assetSize: 170_000_000,
  assetUpdatedAt: '2026-06-10T12:00:00Z',
  digest: `sha256:${'c'.repeat(64)}`,
  packageName: 'com.mhl.music',
  versionName: '1.3.6',
  versionCode: 14,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.platform.mockReturnValue('android');
  useAppUpdateStore.setState({
    status: 'idle',
    installedBuild: null,
    remoteBuild: null,
    decision: null,
    error: null,
    lastCheckedAt: 0,
    lastTrustedTimeMs: 0,
    dismissedDigest: null,
    downloadProgress: 0,
    downloadedApkPath: null,
    updateChannel: 'stable',
  });
  mocks.identity.mockResolvedValue({ success: true, data: installed });
  mocks.release.mockResolvedValue({
    success: true,
    data: {
      build,
      trustedTimeMs: Date.parse('2026-06-20T12:00:00Z'),
    },
  });
  mocks.addProgressListener.mockResolvedValue({ remove: vi.fn() });
  mocks.canInstall.mockResolvedValue({ success: true, data: false });
  mocks.download.mockResolvedValue({
    success: true,
    data: {
      path: 'C:\\cache\\app-updates\\MHL-Music-1.3.6.apk',
      digest: build.digest,
      size: build.assetSize,
    },
  });
  mocks.cancelDownload.mockResolvedValue({ success: true, data: true });
  mocks.inspect.mockResolvedValue({
    success: true,
    data: {
      ...installed,
      versionName: build.versionName,
      versionCode: build.versionCode,
      digest: build.digest,
      matchesInstalledCertificate: true,
    },
  });
  mocks.install.mockResolvedValue({ success: true, data: true });
  mocks.openInstallSettings.mockResolvedValue({ success: true, data: true });
});

describe('app update store', () => {
  it('does nothing outside Android', async () => {
    mocks.platform.mockReturnValue('web');
    await useAppUpdateStore.getState().checkForUpdate(true);
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it('shows a stable candidate as waiting during its safety period', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-11T12:00:00Z'));
    mocks.release.mockResolvedValue({
      success: true,
      data: {
        build,
        trustedTimeMs: Date.parse('2026-06-11T12:00:00Z'),
      },
    });
    await useAppUpdateStore.getState().checkForUpdate(true);
    expect(useAppUpdateStore.getState()).toMatchObject({
      status: 'waiting',
      remoteBuild: { versionName: '1.3.6' },
      error: null,
    });
    vi.restoreAllMocks();
  });

  it('skips repeated automatic checks within 24 hours', async () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useAppUpdateStore.setState({
      lastCheckedAt: now - 1000,
      installedBuild: installed,
    });
    await useAppUpdateStore.getState().checkForUpdate(false);
    expect(mocks.identity).not.toHaveBeenCalled();
    await useAppUpdateStore.getState().checkForUpdate(true);
    expect(mocks.identity).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('rechecks a waiting build when its eligibility time arrives', async () => {
    const now = Date.parse('2026-06-17T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useAppUpdateStore.setState({
      status: 'waiting',
      lastCheckedAt: now - 1000,
      installedBuild: installed,
      remoteBuild: build,
      decision: {
        status: 'waiting',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });

    await useAppUpdateStore.getState().checkForUpdate(false);

    expect(mocks.identity).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().status).toBe('available');
    vi.restoreAllMocks();
  });

  it('does not cache a failed automatic check for 24 hours', async () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.release.mockResolvedValueOnce({
      success: false,
      error: { code: 'NETWORK', detail: 'Offline.' },
    });

    await useAppUpdateStore.getState().checkForUpdate(false);
    await useAppUpdateStore.getState().checkForUpdate(false);

    expect(mocks.identity).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('refreshes native identity when persisted state has no installed build', async () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useAppUpdateStore.setState({
      lastCheckedAt: now - 1000,
      installedBuild: null,
    });

    await useAppUpdateStore.getState().checkForUpdate(false);

    expect(mocks.identity).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().installedBuild).toEqual(installed);
    vi.restoreAllMocks();
  });

  it('keeps update failures isolated in typed state', async () => {
    mocks.release.mockResolvedValue({
      success: false,
      error: { code: 'INVALID_MANIFEST', detail: 'Missing manifest.' },
    });
    await useAppUpdateStore.getState().checkForUpdate(true);
    expect(useAppUpdateStore.getState()).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_MANIFEST' },
    });
  });

  it('does not report an error when the installed build is newer than GitHub', async () => {
    mocks.identity.mockResolvedValue({
      success: true,
      data: { ...installed, versionName: '1.4.3', versionCode: 17 },
    });

    await useAppUpdateStore.getState().checkForUpdate(true);

    expect(useAppUpdateStore.getState()).toMatchObject({
      status: 'upToDate',
      decision: { status: 'upToDate', reason: 'installedBuildIsNewer' },
      error: null,
    });
  });

  it('rechecks the asset before downloading and validates the APK identity', async () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useAppUpdateStore.setState({
      status: 'available',
      installedBuild: installed,
      remoteBuild: build,
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });

    await useAppUpdateStore.getState().downloadAvailableUpdate();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.inspect).toHaveBeenCalledWith(
      'C:\\cache\\app-updates\\MHL-Music-1.3.6.apk',
    );
    expect(useAppUpdateStore.getState().status).toBe('readyToInstall');
    vi.restoreAllMocks();
  });

  it('runs check, download, validation, and install from one update action', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-20T12:00:00Z'));

    await useAppUpdateStore.getState().updateApp();

    expect(mocks.identity).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledTimes(3);
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.inspect).toHaveBeenCalledTimes(2);
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().status).toBe('installing');
    vi.restoreAllMocks();
  });

  it('does not start duplicate app update operations', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-20T12:00:00Z'));
    let resolveIdentity:
      | ((value: { success: true; data: InstalledAndroidBuild }) => void)
      | undefined;
    mocks.identity.mockImplementation(() => new Promise((resolve) => {
      resolveIdentity = resolve;
    }));

    const first = useAppUpdateStore.getState().updateApp();
    const second = useAppUpdateStore.getState().updateApp();
    resolveIdentity?.({ success: true, data: installed });
    await Promise.all([first, second]);

    expect(mocks.identity).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('does not download when the GitHub asset changes', async () => {
    useAppUpdateStore.setState({
      status: 'available',
      installedBuild: installed,
      remoteBuild: build,
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });
    mocks.release.mockResolvedValue({
      success: true,
      data: {
        build: {
          ...build,
          assetId: 99,
          assetUpdatedAt: '2026-06-20T12:00:00Z',
          digest: `sha256:${'d'.repeat(64)}`,
        },
        trustedTimeMs: Date.parse('2026-06-20T12:00:00Z'),
      },
    });

    await useAppUpdateStore.getState().downloadAvailableUpdate();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().status).toBe('waiting');
  });

  it('switches to beta and checks prereleases immediately', async () => {
    await useAppUpdateStore.getState().setUpdateChannel('beta');
    expect(mocks.release).toHaveBeenCalledWith('beta');
    expect(useAppUpdateStore.getState().updateChannel).toBe('beta');
  });

  it('cancels an active download and restores the available state', async () => {
    let resolveDownload:
      | ((value: {
          success: false;
          error: { code: 'DOWNLOAD_CANCELLED'; detail: string };
        }) => void)
      | undefined;
    mocks.download.mockImplementation(() => new Promise((resolve) => {
      resolveDownload = resolve;
    }));
    useAppUpdateStore.setState({
      status: 'available',
      installedBuild: installed,
      remoteBuild: build,
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });

    const downloadPromise = useAppUpdateStore.getState().downloadAvailableUpdate();
    await vi.waitFor(() => expect(useAppUpdateStore.getState().status).toBe('downloading'));
    await useAppUpdateStore.getState().cancelAvailableUpdateDownload();
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    resolveDownload?.({
      success: false,
      error: { code: 'DOWNLOAD_CANCELLED', detail: 'Cancelled.' },
    });
    await downloadPromise;
    expect(useAppUpdateStore.getState()).toMatchObject({
      status: 'available',
      downloadProgress: 0,
      error: null,
    });
  });

  it('rechecks and reinspects the APK before opening the installer', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-20T12:00:00Z'));
    useAppUpdateStore.setState({
      status: 'readyToInstall',
      installedBuild: installed,
      remoteBuild: build,
      downloadedApkPath: 'C:\\cache\\app-updates\\MHL-Music-1.3.6.apk',
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });

    await useAppUpdateStore.getState().installReadyUpdate();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().status).toBe('installing');
    vi.restoreAllMocks();
  });

  it('routes missing install permission to a dedicated state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-20T12:00:00Z'));
    useAppUpdateStore.setState({
      status: 'readyToInstall',
      installedBuild: installed,
      remoteBuild: build,
      downloadedApkPath: 'C:\\cache\\app-updates\\MHL-Music-1.3.6.apk',
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });
    mocks.install.mockResolvedValue({
      success: false,
      error: {
        code: 'INSTALL_PERMISSION_REQUIRED',
        detail: 'Permission required.',
      },
    });

    await useAppUpdateStore.getState().installReadyUpdate();
    expect(useAppUpdateStore.getState().status).toBe('permissionRequired');
    vi.restoreAllMocks();
  });

  it('waits when install permission is still disabled after returning from settings', async () => {
    useAppUpdateStore.setState({ status: 'permissionRequired' });

    await useAppUpdateStore.getState().resumeInstallAfterPermission();

    expect(mocks.canInstall).toHaveBeenCalledOnce();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().status).toBe('permissionRequired');
  });

  it('resumes installation after the user grants install permission', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-20T12:00:00Z'));
    mocks.canInstall.mockResolvedValue({ success: true, data: true });
    useAppUpdateStore.setState({
      status: 'permissionRequired',
      installedBuild: installed,
      remoteBuild: build,
      downloadedApkPath: 'C:\\cache\\app-updates\\MHL-Music-1.3.6.apk',
      decision: {
        status: 'available',
        replacementBuild: false,
        eligibleAt: '2026-06-17T12:00:00.000Z',
      },
    });

    await useAppUpdateStore.getState().resumeInstallAfterPermission();

    expect(mocks.canInstall).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().status).toBe('installing');
    vi.restoreAllMocks();
  });

  it('ignores duplicate resume events while checking install permission', async () => {
    let resolvePermission: ((value: { success: true; data: boolean }) => void) | undefined;
    mocks.canInstall.mockImplementation(() => new Promise((resolve) => {
      resolvePermission = resolve;
    }));
    useAppUpdateStore.setState({ status: 'permissionRequired' });

    const firstResume = useAppUpdateStore.getState().resumeInstallAfterPermission();
    const secondResume = useAppUpdateStore.getState().resumeInstallAfterPermission();
    resolvePermission?.({ success: true, data: false });
    await Promise.all([firstResume, secondResume]);

    expect(mocks.canInstall).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().status).toBe('permissionRequired');
  });
});
