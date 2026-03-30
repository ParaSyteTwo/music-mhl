# Changelog

## v1.2.3 - 2026-03-31

### Fixed

- Corregido un error que generaba archivos duplicados al descargar pistas.

### Improved

- Mejora en la extracción y escritura de metadatos (más campos y mayor precisión).

### Optimized

- Optimización en el flujo de descarga y procesamiento para reducir uso de CPU y memoria.

### Notes

- Android and web builds updated to reflect metadata and performance fixes.


## v1.1.0 - 2026-03-29

### Added

- Candidate picker before downloading so the user can choose the exact YouTube result.
- Download modes for `Original`, `Cover`, and `Live`.
- Direct `videoId` override support in the web and native download flows.
- Backend candidate lookup endpoint and broker fallback logic for better resilience.

### Changed

- Web downloads no longer depend on guessing a single result before user confirmation.
- Candidate search now prefers official audio by default and separates alternate versions more clearly.
- Error handling now surfaces backend messages instead of showing only a generic failure.

### Fixed

- Improved the selection flow for songs where the first automatic YouTube match was incorrect.
- Reduced failures when the external download service does not expose the newest candidates endpoint yet.

### Notes

- Android app version is aligned to `1.1.0`.
- Supabase function `yt-stream` was redeployed for this release.

