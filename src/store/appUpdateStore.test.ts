import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => 'android'),
  identity: vi.fn(),
  release: vi.fn(),
  download: vi.fn(),
  cancelDownload: vi.fn(),
  inspect: vi.fn(),
  addProgressListener: vi.fn(),
  install: vi.fn(),
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
  openAndroidInstallPermissionSettings: mocks.openInstallSettings,
}));
vi.mock('@/lib/githubAndroidRelease', () => ({
  fetchLatestOfficialAndroidRelease: mocks.release,
}));

import { useAppUpdateStore } from './appUpdateStore';

const installed = {
  packageName: 'com.mhl.music',
  versionName: '1.3.5',
  versionCode: 13,
  digest: `sha256:${'a'.repeat(64)}`,
  signingCertificateDigests: [`sha256:${'b'.repeat(64)}`],
};

const build = {
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

  it('shows a candidate in the safety period without download actions', async () => {
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
      status: 'safetyPeriod',
      remoteBuild: { versionName: '1.3.6' },
      error: null,
    });
    vi.restoreAllMocks();
  });

  it('skips repeated automatic checks within 24 hours', async () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useAppUpdateStore.setState({ lastCheckedAt: now - 1000 });
    await useAppUpdateStore.getState().checkForUpdate(false);
    expect(mocks.identity).not.toHaveBeenCalled();
    await useAppUpdateStore.getState().checkForUpdate(true);
    expect(mocks.identity).toHaveBeenCalledOnce();
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
    expect(useAppUpdateStore.getState().status).toBe('safetyPeriod');
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
});
