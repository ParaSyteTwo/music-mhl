import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  ANDROID_PACKAGE_NAME,
  ANDROID_RELEASE_MANIFEST_NAME,
  OFFICIAL_GITHUB_OWNER,
  OFFICIAL_GITHUB_REPOSITORY,
  type AndroidReleaseManifest,
  type AppUpdateChannel,
  type FetchedAndroidRelease,
  type FetchedDesktopRelease,
  type AppUpdateResult,
  type RemoteAndroidBuild,
  type RemoteDesktopBuild,
  type Sha256Digest,
} from '@/types/appUpdate';

interface GitHubAsset {
  id: number;
  name: string;
  state: string;
  size: number;
  digest: string | null;
  updated_at: string;
  browser_download_url: string;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseAsset(value: unknown): GitHubAsset | null {
  if (!isRecord(value)) return null;
  if (
    !isPositiveInteger(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.state) ||
    typeof value.size !== 'number' ||
    value.size <= 0 ||
    !(value.digest === null || typeof value.digest === 'string') ||
    !isNonEmptyString(value.updated_at) ||
    !isNonEmptyString(value.browser_download_url)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    state: value.state,
    size: value.size,
    digest: value.digest as string | null,
    updated_at: value.updated_at,
    browser_download_url: value.browser_download_url,
  };
}

function parseRelease(value: unknown): GitHubRelease | null {
  if (!isRecord(value) || !Array.isArray(value.assets)) return null;
  const assets = value.assets.map(parseAsset);
  if (assets.some((asset) => asset === null)) return null;
  if (
    !isPositiveInteger(value.id) ||
    !isNonEmptyString(value.tag_name) ||
    !isNonEmptyString(value.html_url) ||
    typeof value.draft !== 'boolean' ||
    typeof value.prerelease !== 'boolean'
  ) {
    return null;
  }

  return {
    id: value.id,
    tag_name: value.tag_name,
    html_url: value.html_url,
    draft: value.draft,
    prerelease: value.prerelease,
    assets: assets as GitHubAsset[],
  };
}

export function parseAndroidReleaseManifest(value: unknown): AppUpdateResult<AndroidReleaseManifest> {
  if (!isRecord(value)) {
    return {
      success: false,
      error: { code: 'INVALID_MANIFEST', detail: 'Android release manifest must be an object.' },
    };
  }

  const { schemaVersion, packageName, versionName, versionCode, apkAssetName } = value;
  if (
    schemaVersion !== 1 ||
    packageName !== ANDROID_PACKAGE_NAME ||
    !isNonEmptyString(versionName) ||
    !isPositiveInteger(versionCode) ||
    apkAssetName !== `MHL-Music-${versionName}.apk`
  ) {
    return {
      success: false,
      error: { code: 'INVALID_MANIFEST', detail: 'Android release manifest fields are inconsistent.' },
    };
  }

  return {
    success: true,
    data: {
      schemaVersion: 1,
      packageName: ANDROID_PACKAGE_NAME,
      versionName,
      versionCode,
      apkAssetName,
    },
  };
}

function normalizeDigest(value: string | null): Sha256Digest | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return /^sha256:[a-f0-9]{64}$/.test(normalized)
    ? normalized as Sha256Digest
    : null;
}

function isOfficialAssetUrl(url: string, tag: string, assetName: string): boolean {
  try {
    const parsed = new URL(url);
    const expectedPath =
      `/${OFFICIAL_GITHUB_OWNER}/${OFFICIAL_GITHUB_REPOSITORY}/releases/download/` +
      `${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname === expectedPath;
  } catch {
    return false;
  }
}

export async function fetchLatestOfficialAndroidRelease(
  channel: AppUpdateChannel = 'stable',
  fetchImpl?: typeof fetch,
): Promise<AppUpdateResult<FetchedAndroidRelease>> {
  try {
    const releaseApi = channel === 'stable'
      ? 'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases/latest'
      : 'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases?per_page=20';
    const useNativeHttp = !fetchImpl && Capacitor.getPlatform() === 'android';
    let responseValue: unknown;
    let githubDateHeader = '';

    if (useNativeHttp) {
      const releaseResponse = await CapacitorHttp.get({
        url: releaseApi,
        headers: { Accept: 'application/vnd.github+json' },
        responseType: 'json',
      });
      if (releaseResponse.status < 200 || releaseResponse.status >= 300) {
        return {
          success: false,
          error: {
            code: 'NETWORK',
            detail: `GitHub release request failed with status ${releaseResponse.status}.`,
          },
        };
      }
      responseValue = releaseResponse.data;
      const dateHeader = Object.entries(releaseResponse.headers).find(
        ([name]) => name.toLowerCase() === 'date',
      )?.[1];
      githubDateHeader = typeof dateHeader === 'string' ? dateHeader : '';
    } else {
      const releaseResponse = await (fetchImpl ?? fetch)(releaseApi, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      if (!releaseResponse.ok) {
        return {
          success: false,
          error: {
            code: 'NETWORK',
            detail: `GitHub release request failed with status ${releaseResponse.status}.`,
          },
        };
      }
      responseValue = await releaseResponse.json();
      githubDateHeader = releaseResponse.headers.get('date') ?? '';
    }

    const releaseValue = channel === 'stable'
      ? responseValue
      : Array.isArray(responseValue)
        ? responseValue.find((value) => {
            const candidate = parseRelease(value);
            return candidate && !candidate.draft;
          })
        : null;
    const release = parseRelease(releaseValue);
    if (
      !release ||
      release.draft ||
      (channel === 'stable' && release.prerelease)
    ) {
      return {
        success: false,
        error: { code: 'INVALID_RELEASE', detail: 'Latest GitHub release is not valid for Android updates.' },
      };
    }

    const manifestAssets = release.assets.filter(
      (asset) => asset.name === ANDROID_RELEASE_MANIFEST_NAME,
    );
    if (
      manifestAssets.length !== 1 ||
      !isOfficialAssetUrl(
        manifestAssets[0].browser_download_url,
        release.tag_name,
        ANDROID_RELEASE_MANIFEST_NAME,
      )
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          detail: 'Latest release does not contain one official Android manifest.',
        },
      };
    }

    let manifestValue: unknown;
    if (useNativeHttp) {
      const manifestResponse = await CapacitorHttp.get({
        url: manifestAssets[0].browser_download_url,
        responseType: 'json',
      });
      if (manifestResponse.status < 200 || manifestResponse.status >= 300) {
        return {
          success: false,
          error: {
            code: 'NETWORK',
            detail: `Android manifest request failed with status ${manifestResponse.status}.`,
          },
        };
      }
      manifestValue = manifestResponse.data;
    } else {
      const manifestResponse = await (fetchImpl ?? fetch)(
        manifestAssets[0].browser_download_url,
        { cache: 'no-store' },
      );
      if (!manifestResponse.ok) {
        return {
          success: false,
          error: {
            code: 'NETWORK',
            detail: `Android manifest request failed with status ${manifestResponse.status}.`,
          },
        };
      }
      manifestValue = await manifestResponse.json();
    }

    const parsedRelease = parseOfficialAndroidRelease(releaseValue, manifestValue, channel);
    if (parsedRelease.success === false) {
      return { success: false, error: parsedRelease.error };
    }

    const githubDate = Date.parse(githubDateHeader);
    return {
      success: true,
      data: {
        build: parsedRelease.data,
        trustedTimeMs: Number.isFinite(githubDate) ? githubDate : 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK',
        detail: error instanceof Error ? error.message : 'Could not query GitHub Releases.',
      },
    };
  }
}

export function parseOfficialAndroidRelease(
  releaseValue: unknown,
  manifestValue: unknown,
  channel: AppUpdateChannel = 'stable',
): AppUpdateResult<RemoteAndroidBuild> {
  const release = parseRelease(releaseValue);
  if (
    !release ||
    release.draft ||
    (channel === 'stable' && release.prerelease)
  ) {
    return {
      success: false,
      error: {
        code: 'INVALID_RELEASE',
        detail: 'Release is invalid, draft, or incompatible with the selected channel.',
      },
    };
  }

  const manifestResult = parseAndroidReleaseManifest(manifestValue);
  if (manifestResult.success === false) {
    return { success: false, error: manifestResult.error };
  }
  const manifest = manifestResult.data;

  const isStableMatch = release.tag_name === `v${manifest.versionName}`;
  const isBetaMatch = channel !== 'stable' && release.tag_name.startsWith(`v${manifest.versionName}`);
  if (!isStableMatch && !isBetaMatch) {
    return {
      success: false,
      error: { code: 'INVALID_RELEASE_METADATA', detail: 'Release tag and Android version do not match.' },
    };
  }

  const manifestAssets = release.assets.filter((asset) => asset.name === ANDROID_RELEASE_MANIFEST_NAME);
  const apkAssets = release.assets.filter((asset) => asset.name === manifest.apkAssetName);
  if (manifestAssets.length !== 1 || apkAssets.length !== 1) {
    return {
      success: false,
      error: { code: 'NO_COMPATIBLE_APK', detail: 'Release must contain exactly one manifest and one matching APK.' },
    };
  }

  const apkAsset = apkAssets[0];
  if (apkAsset.state !== 'uploaded') {
    return {
      success: false,
      error: { code: 'NO_COMPATIBLE_APK', detail: 'APK asset is not fully uploaded.' },
    };
  }

  const digest = normalizeDigest(apkAsset.digest);
  if (!digest) {
    return {
      success: false,
      error: { code: 'DIGEST_MISSING', detail: 'APK asset must expose a SHA-256 digest.' },
    };
  }

  if (!isOfficialAssetUrl(apkAsset.browser_download_url, release.tag_name, apkAsset.name)) {
    return {
      success: false,
      error: { code: 'INVALID_DOWNLOAD_URL', detail: 'APK download URL is outside the official repository.' },
    };
  }

  return {
    success: true,
    data: {
      channel,
      releaseId: release.id,
      releaseTag: release.tag_name,
      releaseUrl: release.html_url,
      assetId: apkAsset.id,
      assetName: apkAsset.name,
      assetUrl: apkAsset.browser_download_url,
      assetSize: apkAsset.size,
      assetUpdatedAt: apkAsset.updated_at,
      digest,
      packageName: manifest.packageName,
      versionName: manifest.versionName,
      versionCode: manifest.versionCode,
    },
  };
}

export function parseOfficialDesktopRelease(
  releaseValue: unknown,
  channel: AppUpdateChannel = 'stable',
): AppUpdateResult<RemoteDesktopBuild> {
  const release = parseRelease(releaseValue);
  if (
    !release ||
    release.draft ||
    (channel === 'stable' && release.prerelease)
  ) {
    return {
      success: false,
      error: {
        code: 'INVALID_RELEASE',
        detail: 'Release is invalid, draft, or incompatible with the selected channel.',
      },
    };
  }

  const versionName = release.tag_name.replace(/^v/, '');
  const expectedZipName = `MHL-Music-Portable-${versionName}.zip`;
  const zipAssets = release.assets.filter(
    (asset) =>
      asset.name === expectedZipName ||
      (asset.name.startsWith('MHL-Music-Portable-') && asset.name.endsWith('.zip')),
  );

  if (zipAssets.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_COMPATIBLE_APK',
        detail: `Release ${release.tag_name} does not contain a portable Windows ZIP asset.`,
      },
    };
  }

  const zipAsset = zipAssets[0];
  if (zipAsset.state !== 'uploaded') {
    return {
      success: false,
      error: { code: 'NO_COMPATIBLE_APK', detail: 'Portable ZIP asset is not fully uploaded.' },
    };
  }

  return {
    success: true,
    data: {
      platform: 'desktop',
      channel,
      releaseId: release.id,
      releaseTag: release.tag_name,
      releaseUrl: release.html_url,
      assetId: zipAsset.id,
      assetName: zipAsset.name,
      assetUrl: zipAsset.browser_download_url,
      assetSize: zipAsset.size,
      assetUpdatedAt: zipAsset.updated_at,
      versionName,
    },
  };
}

export async function fetchLatestOfficialDesktopRelease(
  channel: AppUpdateChannel = 'stable',
  fetchImpl?: typeof fetch,
): Promise<AppUpdateResult<FetchedDesktopRelease>> {
  try {
    const releaseApi =
      channel === 'stable'
        ? 'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases/latest'
        : 'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases?per_page=20';

    const releaseResponse = await (fetchImpl ?? fetch)(releaseApi, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });

    if (!releaseResponse.ok) {
      return {
        success: false,
        error: {
          code: 'NETWORK',
          detail: `GitHub release request failed with status ${releaseResponse.status}.`,
        },
      };
    }

    const responseValue = await releaseResponse.json();
    const githubDateHeader = releaseResponse.headers.get('date') ?? '';

    const releaseValue =
      channel === 'stable'
        ? responseValue
        : Array.isArray(responseValue)
          ? responseValue.find((value) => {
              const candidate = parseRelease(value);
              return candidate && !candidate.draft;
            })
          : null;

    const parsed = parseOfficialDesktopRelease(releaseValue, channel);
    if (parsed.success === false) {
      return { success: false, error: parsed.error };
    }

    const githubDate = Date.parse(githubDateHeader);
    return {
      success: true,
      data: {
        build: parsed.data,
        trustedTimeMs: Number.isFinite(githubDate) ? githubDate : 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK',
        detail: error instanceof Error ? error.message : 'Could not query GitHub Releases.',
      },
    };
  }
}

