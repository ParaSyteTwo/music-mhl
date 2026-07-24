# QA — resolución, letras y metadatos 1.4.8-beta.3

Alcance: Desktop + Android.

## Automatizado

- La primera Song de YouTube Music sin contradicciones habilita descarga directa.
- Radio Edit no se clasifica como remix y una Extended Version incompatible se rechaza.
- Las colaboraciones distintas se detectan en el título y en arrays estructurados de artistas.
- Android enriquece los dos primeros candidatos profundos como `JSONObject`.
- El LRC escribe una sola entrada por timestamp.
- Japonés, coreano y líneas latinas se romanizan de forma independiente.
- Los huecos parciales de romaji y traducción se completan sin desplazar versos.
- La conversión Base64 soporta buffers grandes sin concatenación por byte.

## Validación ejecutada

- ESLint y TypeScript: correctos.
- Vitest: 217 pruebas correctas.
- pytest Desktop: 41 pruebas correctas.
- Build Vite y sincronización Capacitor: correctos.
- Tests Android y compilación Release firmada: correctos.
- Smoke test y empaquetado del ZIP portable: correctos.
- Contrato Android: package, versión, firma, APK y manifiesto correctos.

## QA manual pendiente

- Repetir `Everybody (Backstreet's Back) (Radio Edit)` en Android y confirmar que supera metadatos.
- Probar `Take Me to the Beach` con varias colaboraciones y confirmar que abre el selector.
- Probar una canción japonesa y otra coreana con romaji y traducción española.
- Confirmar en el reproductor habitual que cada timestamp se muestra una sola vez.
