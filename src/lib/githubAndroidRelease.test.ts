import { describe, expect, it, vi } from 'vitest';

const capacitorMocks = vi.hoisted(() => ({
  platform: vi.fn(() => 'web'),
  get: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: capacitorMocks.platform },
  CapacitorHttp: { get: capacitorMocks.get },
}));

import {
  fetchLatestOfficialAndroidRelease,
  parseAndroidReleaseManifest,
  parseOfficialAndroidRelease,
} from './githubAndroidRelease';

const digest = `sha256:${'a'.repeat(64)}`;

function createManifest() {
  return {
    schemaVersion: 1,
    packageName: 'com.mhl.music',
    versionName: '1.3.6',
    versionCode: 14,
    apkAssetName: 'MHL-Music-1.3.6.apk',
  };
}

function createRelease() {
  return {
    id: 10,
    tag_name: 'v1.3.6',
    html_url: 'https://github.com/ParaSyteTwo/music-mhl/releases/tag/v1.3.6',
    draft: false,
    prerelease: false,
    assets: [
      {
        id: 20,
        name: 'MHL-Music-Android.json',
        state: 'uploaded',
        size: 150,
        digest: `sha256:${'b'.repeat(64)}`,
        updated_at: '2026-06-10T12:00:00Z',
        browser_download_url:
          'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-Android.json',
      },
      {
        id: 21,
        name: 'MHL-Music-1.3.6.apk',
        state: 'uploaded',
        size: 170_000_000,
        digest,
        updated_at: '2026-06-10T12:00:00Z',
        browser_download_url:
          'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-1.3.6.apk',
      },
    ],
  };
}

describe('Android release manifest', () => {
  it('accepts the canonical manifest contract', () => {
    expect(parseAndroidReleaseManifest(createManifest())).toEqual({
      success: true,
      data: createManifest(),
    });
  });

  it('rejects a different package or inconsistent APK name', () => {
    expect(parseAndroidReleaseManifest({
      ...createManifest(),
      packageName: 'com.attacker.music',
    }).success).toBe(false);
    expect(parseAndroidReleaseManifest({
      ...createManifest(),
      apkAssetName: 'other.apk',
    }).success).toBe(false);
  });
});

describe('official GitHub Android release', () => {
  it('accepts one official uploaded APK with a SHA-256 digest', () => {
    const result = parseOfficialAndroidRelease(createRelease(), createManifest());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.digest).toBe(digest);
      expect(result.data.versionCode).toBe(14);
    }
  });

  it('fetches only the official release and its declared manifest', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(createRelease()), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          date: 'Wed, 10 Jun 2026 12:00:00 GMT',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createManifest()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const result = await fetchLatestOfficialAndroidRelease('stable', fetchMock);
    expect(result).toMatchObject({
      success: true,
      data: {
        build: { versionName: '1.3.6' },
        trustedTimeMs: Date.parse('2026-06-10T12:00:00Z'),
      },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases/latest',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://github.com/ParaSyteTwo/music-mhl/releases/download/v1.3.6/MHL-Music-Android.json',
    );
  });

  it('uses native HTTP on Android so GitHub asset redirects are not blocked by CORS', async () => {
    capacitorMocks.platform.mockReturnValue('android');
    capacitorMocks.get
      .mockResolvedValueOnce({
        status: 200,
        data: createRelease(),
        headers: { date: 'Wed, 10 Jun 2026 12:00:00 GMT' },
        url: 'https://api.github.com/repos/ParaSyteTwo/music-mhl/releases/latest',
      })
      .mockResolvedValueOnce({
        status: 200,
        data: createManifest(),
        headers: {},
        url: createRelease().assets[0].browser_download_url,
      });

    const result = await fetchLatestOfficialAndroidRelease('stable');

    expect(result).toMatchObject({
      success: true,
      data: {
        build: { versionName: '1.3.6' },
        trustedTimeMs: Date.parse('2026-06-10T12:00:00Z'),
      },
    });
    expect(capacitorMocks.get).toHaveBeenNthCalledWith(2, {
      url: createRelease().assets[0].browser_download_url,
      responseType: 'json',
    });
    capacitorMocks.platform.mockReturnValue('web');
    capacitorMocks.get.mockReset();
  });

  it('selects a published prerelease for beta testers', async () => {
    const betaRelease = { ...createRelease(), prerelease: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([betaRelease]), {
        status: 200,
        headers: { date: 'Wed, 10 Jun 2026 12:00:00 GMT' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createManifest()), { status: 200 }));

    const result = await fetchLatestOfficialAndroidRelease('beta', fetchMock);
    expect(result).toMatchObject({
      success: true,
      data: { build: { channel: 'beta', versionName: '1.3.6' } },
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/releases?per_page=20');
  });

  it('rejects a stable-only release list for the beta channel', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([createRelease()]), { status: 200 }));

    const result = await fetchLatestOfficialAndroidRelease('beta', fetchMock);
    expect(result).toMatchObject({
      success: false,
      error: { code: 'INVALID_RELEASE' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects drafts, prereleases, and mismatched tags', () => {
    expect(parseOfficialAndroidRelease({
      ...createRelease(),
      draft: true,
    }, createManifest()).success).toBe(false);
    expect(parseOfficialAndroidRelease({
      ...createRelease(),
      prerelease: true,
    }, createManifest()).success).toBe(false);
    expect(parseOfficialAndroidRelease({
      ...createRelease(),
      tag_name: 'v1.3.7',
    }, createManifest()).success).toBe(false);
  });

  it('rejects missing digests and non-official download URLs', () => {
    const missingDigest = createRelease();
    missingDigest.assets[1].digest = null;
    expect(parseOfficialAndroidRelease(missingDigest, createManifest())).toMatchObject({
      success: false,
      error: { code: 'DIGEST_MISSING' },
    });

    const externalUrl = createRelease();
    externalUrl.assets[1].browser_download_url =
      'https://example.com/MHL-Music-1.3.6.apk';
    expect(parseOfficialAndroidRelease(externalUrl, createManifest())).toMatchObject({
      success: false,
      error: { code: 'INVALID_DOWNLOAD_URL' },
    });
  });

  it('rejects duplicate matching APK assets', () => {
    const release = createRelease();
    release.assets.push({ ...release.assets[1], id: 22 });
    expect(parseOfficialAndroidRelease(release, createManifest())).toMatchObject({
      success: false,
      error: { code: 'NO_COMPATIBLE_APK' },
    });
  });
});
