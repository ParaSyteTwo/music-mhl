# Changelog

## v1.3.5 - 2026-06-09

### Added

- Complete Spanish and English interface with device-language detection and manual selection.
- Language controls in Settings across Web, Android, and Windows.
- Romanization and translation for supported lyric languages and writing systems.
- A unified candidate-quality model using title, artist, album, official channel, duration, and ISRC when available.
- Adaptive Android candidate-search concurrency, using two workers on modest devices and up to four on more capable devices.

### Improved

- Search responsiveness through short-lived caching, in-flight request reuse, debouncing, and stale-response protection.
- Candidate picker prefetching so opening the picker reuses the request started on the initial tap.
- Candidate selection now returns no more than the three best unique, ordered results.
- Official audio and correct-duration results rank above covers, live recordings, remixes, altered-speed versions, instrumentals, and music videos.
- Additional candidate queries only run when the first query does not reach the required confidence.
- Picker rendering is limited to three rows, with lazy artwork loading and reduced animation on lower-end devices.
- Audio, metadata, and lyrics begin in parallel while preserving metadata, lyric, and audio-quality behavior.
- Windows and Android proceed to the next queued download without an artificial three-second delay.
- Web/PWA retains protective pacing for its shared remote backend.
- Translation logic is decoupled from React and Zustand.
- Language consistency across Library, Downloads, Search, Settings, notifications, counters, actions, and the player.

### Fixed

- Lyrics are no longer translated when their original language matches the application's effective language.
- `letras.com` only supplies its Spanish translation when Spanish is the requested target.
- Existing language preferences migrate correctly to the new `system`, `es`, or `en` modes.
- Older search responses can no longer overwrite newer results.
- Duplicate picker requests and duplicate candidate rows are eliminated.
- Windows health checks no longer contact the Web/Fly.io backend.

### Platform notes

- Windows remains fully local for candidate lookup, downloads, metadata, and lyrics.
- Android keeps its existing native transport and does not require native project changes for these optimizations.
- Download concurrency remains capped at two across supported platforms.

### Verification

- TypeScript checks, focused linting, frontend unit tests, Python scoring tests, desktop bridge tests, and the production PWA build passed.

## v1.2.3 - 2026-03-31

### Fixed

- Fixed an issue that could create duplicate files when downloading tracks.

### Improved

- Improved metadata extraction and writing with more fields and greater accuracy.

### Optimized

- Reduced CPU and memory usage during download and processing.

### Notes

- Android and Web builds were updated with the metadata and performance fixes.

## v1.1.0 - 2026-03-29

### Added

- Candidate picker before downloading so the user can choose the exact YouTube result.
- Download modes for `Original`, `Cover`, and `Live`.
- Direct `videoId` override support in Web and native download flows.
- Backend candidate lookup endpoint and broker fallback logic for better resilience.

### Changed

- Web downloads no longer depend on guessing a single result before user confirmation.
- Candidate search prefers official audio by default and separates alternate versions more clearly.
- Error handling surfaces backend messages instead of showing only a generic failure.

### Fixed

- Improved selection for songs where the first automatic YouTube match was incorrect.
- Reduced failures when the external download service does not expose the newest candidate endpoint.

### Notes

- Android was aligned to version `1.1.0`.
- The Supabase `yt-stream` function was redeployed for this release.
