import {
  UPDATE_SAFETY_PERIOD_MS,
  type AppUpdateDecision,
  type InstalledAndroidBuild,
  type RemoteAndroidBuild,
} from '@/types/appUpdate';

export function evaluateAppUpdate(
  installed: InstalledAndroidBuild,
  remote: RemoteAndroidBuild,
  deviceNowMs: number,
  lastTrustedTimeMs = 0,
): AppUpdateDecision {
  if (remote.versionCode < installed.versionCode) {
    return {
      status: 'rejected',
      error: {
        code: 'DOWNGRADE_REJECTED',
        detail: 'Remote Android build has a lower versionCode than the installed build.',
      },
    };
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

  const eligibleAtMs = updatedAtMs + UPDATE_SAFETY_PERIOD_MS;
  const eligibleAt = new Date(eligibleAtMs).toISOString();
  const replacementBuild = sameVersion && !sameDigest;

  if (lastTrustedTimeMs < eligibleAtMs) {
    const displayNowMs = Math.min(deviceNowMs, eligibleAtMs - 1);
    const remainingMs = Math.max(1, eligibleAtMs - displayNowMs);
    return {
      status: 'safetyPeriod',
      replacementBuild,
      eligibleAt,
      remainingMs,
      remainingDays: Math.ceil(remainingMs / 86_400_000),
    };
  }

  return {
    status: 'available',
    replacementBuild,
    eligibleAt,
  };
}
