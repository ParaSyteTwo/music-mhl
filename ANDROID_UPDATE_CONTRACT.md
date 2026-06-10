# Android Update Contract

> Status: implemented architecture contract
> Applies to: every Android build and release after `1.3.5`
> Last updated: 2026-06-10

This document is the canonical compatibility contract for the future MHL Music Android updater. Every Codex session, contributor, build script, and release process must follow it even before the updater is implemented.

## Immutable Source

- Updates may originate only from `ParaSyteTwo/music-mhl`.
- Stable discovery endpoint:
  `https://api.github.com/repos/ParaSyteTwo/music-mhl/releases/latest`
- Beta discovery endpoint:
  `https://api.github.com/repos/ParaSyteTwo/music-mhl/releases?per_page=20`
- Do not make the owner, repository, API URL, or download host remotely configurable.
- Stable accepts published non-prereleases.
- Beta accepts published prereleases only and is explicitly enabled by the user.
- Drafts are always rejected.
- Do not use Fly.io, mirrors, URL shorteners, or third-party update services.

## Release Assets

Every Android release must include:

```text
MHL-Music-Android.json
MHL-Music-{versionName}.apk
```

`MHL-Music-Android.json` schema:

```json
{
  "schemaVersion": 1,
  "packageName": "com.mhl.music",
  "versionName": "1.3.6",
  "versionCode": 14,
  "apkAssetName": "MHL-Music-1.3.6.apk"
}
```

Rules:

- There must be exactly one matching APK asset.
- `packageName` must always be `com.mhl.music`.
- Tag, `versionName`, manifest, and APK filename must agree.
- `versionCode` must increase for every normal public build.
- Never publish an APK signed with another certificate.
- GitHub `assets[].digest` is the authoritative APK SHA-256.
- Do not duplicate or override that digest inside the JSON manifest.

## Build Identity

An installed or remote build is identified by:

```text
versionCode + versionName + APK SHA-256
```

Comparison policy:

| Remote state | Decision |
|---|---|
| Higher `versionCode` | Update candidate |
| Same version and different SHA-256 | Replacement-build candidate |
| Same version and same SHA-256 | Up to date |
| Lower `versionCode` | Reject downgrade |
| Same `versionCode`, inconsistent `versionName` | Reject invalid metadata |

Replacing an APK while retaining the same version is an exceptional recovery mechanism, not the normal release workflow. Prefer a new `versionCode`.

## Update Channels

- Stable is the default and offers the latest public release immediately.
- Beta is opt-in and offers the newest valid GitHub prerelease.
- Users skip intermediate releases because each channel resolves only its newest candidate.
- Re-query GitHub immediately before downloading and immediately before installing.
- A changed asset ID, digest, size, or `updated_at` invalidates any downloaded APK.
- Never weaken digest, package, version, downgrade, or signing-certificate validation by channel.

## Mandatory Validation

Before installation, perform these checks in order:

1. The release and asset come from the immutable official endpoint.
2. The asset metadata and Android manifest are internally consistent.
3. The downloaded SHA-256 equals GitHub `assets[].digest`.
4. The APK package is `com.mhl.music`.
5. The version/digest comparison allows an update and never a downgrade.
6. The downloaded APK signing certificate equals the installed app certificate.
7. The selected stable/beta channel still contains the same asset.
8. Re-query GitHub and confirm the asset did not change.
9. Open the Android system installer for explicit user confirmation.

Any failed or unavailable validation must block installation without affecting normal app use.

## Signing Compatibility

- Preserve the current release signing key and certificate.
- Keep the `.jks`, passwords, and local signing properties out of Git.
- `android/app/build.gradle` must not contain signing passwords.
- API 28+: validate with `GET_SIGNING_CERTIFICATES` and `SigningInfo`.
- API 24-27: use the legacy `GET_SIGNATURES` fallback.
- Key rotation requires a separately approved migration design. Never trust a replacement certificate declared by remote metadata.

## Implementation Boundaries

- Use a dedicated `AppUpdaterPlugin`; do not add updater behavior to `YtDlpPlugin`.
- Use a dedicated TypeScript bridge and store; do not reuse `ytDlp*` state.
- Android checks must be non-blocking and run at most once per 24 hours automatically.
- A manual check in Settings may bypass the 24-hour cache.
- Installation is assisted, never silent.
- Web and Windows must not initialize or call the Android updater.
- All async failures must use typed errors.
- Each implementation slice requires tests.

## Required Implementation Order

1. Remove signing secrets from tracked Gradle configuration.
2. Implement release parsing, build comparison, and safety-period policy with unit tests.
3. Implement native installed-build identity and certificate validation.
4. Add non-blocking detection and Android-only UI.
5. Add private APK download, progress, cancellation, and validation.
6. Add system installation and unknown-source permission flow.
7. Automate manifest generation and release verification.

Do not skip directly to APK installation before the preceding validation slices exist.

## Release Command

Prepare and verify an Android release with:

```text
npm run android:prepare-release -- --apk path/to/signed-release.apk
```

The command blocks output unless all of these agree:

- `package.json` version
- Android `versionName` and `versionCode`
- APK package, version, and version code
- The preserved official signing certificate

On success it writes the canonical APK name and `MHL-Music-Android.json` to
`release/`. The printed APK SHA-256 is diagnostic only; GitHub's asset digest
remains authoritative for the updater.

## Release Checklist

- [ ] Increment Android `versionCode`.
- [ ] Align package version, Android `versionName`, tag, manifest, and filenames.
- [ ] Build with the existing release certificate.
- [ ] Verify package name and signing certificate.
- [ ] Generate `MHL-Music-Android.json`.
- [ ] Place APK and manifest in `release/`.
- [ ] Publish exactly one matching APK asset.
- [ ] Confirm GitHub exposes a `sha256:` digest.
- [ ] Do not replace a published APK; publish a higher `versionCode`.
- [ ] Verify stable and beta channel behavior after publication.

## Related Documentation

- Product requirements: `PRD.md`
- Technical design: `TECH_DESIGN.md`
- Project rules: `AGENTS.md`
- Detailed planning note: Android Obsidian vault, `wiki/workflows/mhl-music-auto-update-github-releases.md`
