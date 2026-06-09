# Changelog

## v1.3.5 - 2026-06-09

### Added

- Interfaz completa en español e inglés con detección del idioma del dispositivo y selección manual.
- Controles de idioma accesibles en ajustes para Web, Android y Windows.
- Romanización y traducción de letras para los idiomas y escrituras compatibles.

### Fixed

- Las letras ya no se traducen cuando el idioma original coincide con el idioma efectivo de la aplicación.
- `letras.com` solo aporta su traducción española cuando el destino es español.
- Los avisos, estados, contadores y acciones visibles respetan el idioma seleccionado.
- Migración de la preferencia de idioma anterior al nuevo modo `system`, `es` o `en`.

### Improved

- Núcleo de traducción desacoplado de React y Zustand.
- Mayor coherencia en Biblioteca, Descargas, Búsqueda, Ajustes y reproductor.
- Pruebas unitarias para resolución de idioma, persistencia y procesamiento de letras.

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
