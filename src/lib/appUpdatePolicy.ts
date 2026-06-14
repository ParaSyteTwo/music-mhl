import {
  type AppUpdateDecision,
  type InstalledAndroidBuild,
  type RemoteAndroidBuild,
} from '@/types/appUpdate';

export const ANDROID_ASSET_SAFETY_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateAppUpdate(
  installed: InstalledAndroidBuild,
  remote: RemoteAndroidBuild,
  _deviceNowMs: number,
  lastTrustedTimeMs = 0,
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
  const safetyPeriodMs = remote.channel === 'stable'
    ? ANDROID_ASSET_SAFETY_PERIOD_MS
    : 0;
  const eligibleAtMs = updatedAtMs + safetyPeriodMs;
  const eligibleAt = new Date(eligibleAtMs).toISOString();

  if (lastTrustedTimeMs < eligibleAtMs) {
    return {
      status: 'waiting',
      replacementBuild,
      eligibleAt,
    };
  }

  return {
    status: 'available',
    replacementBuild,
    eligibleAt,
  };
}

export function getRemainingSafetyDays(eligibleAt: string, nowMs = Date.now()): number {
  const eligibleAtMs = Date.parse(eligibleAt);
  if (!Number.isFinite(eligibleAtMs) || eligibleAtMs <= nowMs) return 0;
  return Math.ceil((eligibleAtMs - nowMs) / DAY_MS);
}
