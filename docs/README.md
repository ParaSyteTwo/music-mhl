# Project Documentation

> Scope: Desktop Windows + Android
> Last reviewed: 2026-06-15

## Sources of Truth

Use these documents in this order:

1. `AGENTS.md`: mandatory working rules and platform boundaries.
2. `PRD.md`: current product requirements and out-of-scope features.
3. `TECH_DESIGN.md`: active architecture and implementation boundaries.
4. `ANDROID_UPDATE_CONTRACT.md`: normative Android updater and release rules.
5. `CHANGELOG.md`: release history, not current architecture.

Version identity is read from:

- `package.json`: shared application version.
- `android/app/build.gradle`: Android `versionName` and `versionCode`.
- `mhl-desktop/bridge.py`: Desktop request User-Agent version.

`npm run android:prepare-release` verifies that the shared, Android, Desktop,
APK, package, and signing identities agree before writing Android release
assets.

## Active Product

- Desktop: React assets hosted by pywebview with the Python bridge in
  `mhl-desktop/`.
- Android: React assets hosted by Capacitor with native plugins in `android/`.
- Shared frontend: `src/`.
- Release outputs: portable Windows ZIP, signed Android APK, and
  `MHL-Music-Android.json` in `release/`.

There is no supported Web/PWA release, internal music library, file import
workflow, or playlist manager.

## Legacy and History

- `services/ytdlp-service/`: retained FastAPI code, not deployed or used by the
  active product.
- `docs/legacy/`: maintenance notes for retained legacy code.
- `docs/archive/`: historical snapshots that must not be treated as current
  status.

## Verification

The regular verification set is:

```text
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm test
npm run build
npm run test:android-release-contract
python -m pytest -q test_bridge_candidates.py tests
cd android
gradlew testDebugUnitTest
```

Release verification additionally requires building and smoke-testing the
portable Windows ZIP, building the signed APK, preparing Android release assets,
and comparing local artifacts with the published GitHub release.
