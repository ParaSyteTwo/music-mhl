import { describe, expect, it } from 'vitest';
import { evaluateAppUpdate } from './appUpdatePolicy';
import type { InstalledAndroidBuild, RemoteAndroidBuild } from '@/types/appUpdate';

const installed: InstalledAndroidBuild = {
  packageName: 'com.mhl.music',
  versionName: '1.3.5',
  versionCode: 13,
  digest: `sha256:${'a'.repeat(64)}`,
  signingCertificateDigests: [`sha256:${'b'.repeat(64)}`],
};

function remote(overrides: Partial<RemoteAndroidBuild> = {}): RemoteAndroidBuild {
  return {
    channel: 'stable',
    releaseId: 10,
    releaseTag: 'v1.3.6',
    releaseUrl: 'https://github.com/ParaSyteTwo/music-mhl/releases/tag/v1.3.6',
    assetId: 20,
    assetName: 'MHL-Music-1.3.6.apk',
    assetUrl:
      'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-1.3.6.apk',
    assetSize: 170_000_000,
    assetUpdatedAt: '2026-06-10T12:00:00.000Z',
    digest: `sha256:${'b'.repeat(64)}`,
    packageName: 'com.mhl.music',
    versionName: '1.3.6',
    versionCode: 14,
    ...overrides,
  };
}

describe('app update policy', () => {
  it('reports the exact installed build as up to date', () => {
    expect(evaluateAppUpdate(installed, remote({
      releaseTag: 'v1.3.5',
      assetName: 'MHL-Music-1.3.5.apk',
      versionName: installed.versionName,
      versionCode: installed.versionCode,
      digest: installed.digest,
    }), Date.parse('2026-06-20T12:00:00Z'), Date.parse('2026-06-20T12:00:00Z'))).toEqual({
      status: 'upToDate',
      reason: 'sameBuild',
    });
  });

  it('keeps a stable update unavailable for installation until seven days after upload', () => {
    const decision = evaluateAppUpdate(
      installed,
      remote(),
      Date.parse('2026-06-10T12:00:01Z'),
      0,
    );
    expect(decision).toMatchObject({
      status: 'available',
      replacementBuild: false,
      eligibleAt: '2026-06-17T12:00:00.000Z',
    });
  });

  it('makes a new version available at the exact eligibility time', () => {
    expect(evaluateAppUpdate(
      installed,
      remote(),
      Date.parse('2026-06-17T12:00:00.000Z'),
      Date.parse('2026-06-17T12:00:00.000Z'),
    )).toMatchObject({
      status: 'available',
      replacementBuild: false,
    });
  });

  it('detects a replacement build with the same version by digest', () => {
    expect(evaluateAppUpdate(
      installed,
      remote({
        releaseTag: 'v1.3.5',
        assetName: 'MHL-Music-1.3.5.apk',
        versionName: installed.versionName,
        versionCode: installed.versionCode,
      }),
      Date.parse('2026-06-20T12:00:00Z'),
      Date.parse('2026-06-20T12:00:00Z'),
    )).toMatchObject({
      status: 'available',
      replacementBuild: true,
    });
  });

  it('treats older remote builds as current and rejects inconsistent equal version codes', () => {
    expect(evaluateAppUpdate(installed, remote({
      versionName: '1.3.4',
      versionCode: 12,
    }), Date.now())).toEqual({
      status: 'upToDate',
      reason: 'installedBuildIsNewer',
    });

    expect(evaluateAppUpdate(installed, remote({
      versionName: '1.3.6',
      versionCode: installed.versionCode,
    }), Date.now())).toMatchObject({
      status: 'rejected',
      error: { code: 'INVALID_RELEASE_METADATA' },
    });
  });

  it('derives eligibility from trusted GitHub asset metadata, not device time', () => {
    expect(evaluateAppUpdate(
      installed,
      remote(),
      Date.parse('2026-06-11T12:00:00Z'),
      0,
    )).toMatchObject({
      status: 'available',
      eligibleAt: '2026-06-17T12:00:00.000Z',
    });
  });

  it('makes beta candidates available under the same validation policy', () => {
    expect(evaluateAppUpdate(
      installed,
      remote({ channel: 'beta', versionName: '1.4.0-beta.1', versionCode: 15 }),
      Date.parse('2026-06-10T12:00:01Z'),
      0,
    )).toMatchObject({
      status: 'available',
      eligibleAt: '2026-06-17T12:00:00.000Z',
    });
  });
});
