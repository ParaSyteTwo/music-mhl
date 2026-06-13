import {
  type AppUpdateDecision,
  type InstalledAndroidBuild,
  type RemoteAndroidBuild,
} from '@/types/appUpdate';

export function evaluateAppUpdate(
  installed: InstalledAndroidBuild,
  remote: RemoteAndroidBuild,
  _deviceNowMs: number,
  _lastTrustedTimeMs = 0,
): AppUpdateDecision {
  if (remote.versionCode < installed.versionCode) {
    return { status: 'upToDate', reason: 'installedBuildIsNewer' };
  }

  if (
    remote.versionCode === installed.versionCode &&
    remote.versionName !== installed.versionName
  ) {
    return {
      status: 'rejected',
      error: {
        code: 'INVALID_RELEASE_METADATA',
        detail: 'Equal versionCode values must use the same versionName.',
      },
    };
  }

  const sameVersion = remote.versionCode === installed.versionCode &&
    remote.versionName === installed.versionName;
  const sameDigest = remote.digest.toLowerCase() === installed.digest.toLowerCase();
  if (sameVersion && sameDigest) {
    return { status: 'upToDate', reason: 'sameBuild' };
  }

  const updatedAtMs = Date.parse(remote.assetUpdatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return {
      status: 'rejected',
      error: {
        code: 'INVALID_RELEASE_METADATA',
        detail: 'APK asset updated_at is not a valid timestamp.',
      },
    };
  }

  const replacementBuild = sameVersion && !sameDigest;

  return {
    status: 'available',
    replacementBuild,
    eligibleAt: new Date(0).toISOString(),
  };
}
