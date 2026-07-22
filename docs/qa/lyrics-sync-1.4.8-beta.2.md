# QA — letras sincronizadas y confianza 1.4.8-beta.2

Alcance: Desktop + Android.

## Automatizado

- LRCLIB conserva el timeline canónico cuando Letras.com no se puede alinear por completo.
- Sin timestamps reales se devuelve letra plana y nunca tiempos estimados.
- Los huecos de romaji conservan su posición y no desplazan versos posteriores.
- Una coincidencia verificada de YouTube Music muestra 100%.
- Un uploader sin artista estructurado no se considera catálogo verificado.
- Desktop y Android extraen artista desde los arrays estructurados de yt-dlp.

## Validación ejecutada

- TypeScript `tsconfig.app`: correcto.
- ESLint: correcto.
- Vitest: 213 tests correctos.
- Python: 40 tests correctos.
- Vite production build: correcto.
- Android Java Release: correcto.

## QA manual pendiente

- Confirmar en Android físico una canción japonesa con original, romaji y traducción.
- Confirmar una canción donde Letras.com y LRCLIB tengan saltos de línea diferentes.
- Confirmar que una canción de YouTube Music con artista estructurado, título y duración exactos muestra 100%.
- Confirmar que un resultado de uploader corriente permanece en revisión.
