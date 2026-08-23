export const OFFICIAL_GITHUB_OWNER = 'ParaSyteTwo';
export const OFFICIAL_GITHUB_REPOSITORY = 'music-mhl';
export const OFFICIAL_GITHUB_RELEASE_API =
  `https://api.github.com/repos/${OFFICIAL_GITHUB_OWNER}/${OFFICIAL_GITHUB_REPOSITORY}/releases/latest`;
export const ANDROID_RELEASE_MANIFEST_NAME = 'MHL-Music-Android.json';
export const ANDROID_PACKAGE_NAME = 'com.mhl.music';
export type AppUpdateChannel = 'stable' | 'beta';

export type Sha256Digest = `sha256:${string}`;

export type AppUpdateErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'NETWORK'
  | 'INVALID_RELEASE'
  | 'INVALID_MANIFEST'
  | 'NO_COMPATIBLE_APK'
  | 'DIGEST_MISSING'
  | 'INVALID_DOWNLOAD_URL'
  | 'INVALID_RELEASE_METADATA'
  | 'DOWNGRADE_REJECTED'
  | 'NATIVE_IDENTITY_FAILED'
  | 'APK_INSPECTION_FAILED'
  | 'PACKAGE_MISMATCH'
  | 'SIGNATURE_MISMATCH'
  | 'SAFETY_PERIOD_ACTIVE'
  | 'DOWNLOAD_FAILED'
  | 'DOWNLOAD_CANCELLED'
  | 'CHECKSUM_MISMATCH'
  | 'ASSET_CHANGED'
  | 'INSTALL_PERMISSION_REQUIRED'
  | 'INSTALL_FAILED';

export interface AppUpdateError {
  code: AppUpdateErrorCode;
  detail: string;
}

export type AppUpdateResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppUpdateError };

export interface AndroidReleaseManifest {
  schemaVersion: 1;
  packageName: typeof ANDROID_PACKAGE_NAME;
  versionName: string;
  versionCode: number;
  apkAssetName: string;
}

export interface RemoteAndroidBuild {
  channel: AppUpdateChannel;
  releaseId: number;
  releaseTag: string;
  releaseUrl: string;
  assetId: number;
  assetName: string;
  assetUrl: string;
  assetSize: number;
  assetUpdatedAt: string;
  digest: Sha256Digest;
  packageName: typeof ANDROID_PACKAGE_NAME;
  versionName: string;
  versionCode: number;
}

export interface FetchedAndroidRelease {
  build: RemoteAndroidBuild;
  trustedTimeMs: number;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'waiting'
  | 'available'
  | 'downloading'
  | 'validating'
  | 'readyToInstall'
  | 'permissionRequired'
  | 'installing'
  | 'error';

export interface DownloadedAndroidApk {
  path: string;
  digest: Sha256Digest;
  size: number;
}

export interface InstalledAndroidBuild {
  packageName: typeof ANDROID_PACKAGE_NAME;
  versionName: string;
  versionCode: number;
  digest: Sha256Digest;
  signingCertificateDigests: Sha256Digest[];
}

export interface InstalledDesktopBuild {
  platform: 'desktop';
  versionName: string;
  frozen: boolean;
  appDir: string;
}

export interface RemoteDesktopBuild {
  platform: 'desktop';
  channel: AppUpdateChannel;
  releaseId: number;
  releaseTag: string;
  releaseUrl: string;
  assetId: number;
  assetName: string;
  assetUrl: string;
  assetSize: number;
  assetUpdatedAt: string;
  versionName: string;
}

export interface FetchedDesktopRelease {
  build: RemoteDesktopBuild;
  trustedTimeMs: number;
}

export interface InspectedAndroidApk extends InstalledAndroidBuild {
  matchesInstalledCertificate: boolean;
}

export type AppUpdateDecision =
  | {
      status: 'upToDate';
      reason: 'sameBuild' | 'installedBuildIsNewer';
    }
  | {
      status: 'rejected';
      error: AppUpdateError;
    }
  | {
      status: 'waiting';
      replacementBuild: boolean;
      eligibleAt: string;
    }
  | {
      status: 'available';
      replacementBuild: boolean;
      eligibleAt: string;
    };
