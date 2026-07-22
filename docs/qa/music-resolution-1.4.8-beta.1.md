# QA de resolución musical — 1.4.8-beta.1

Alcance: Desktop Windows 10/11 + Android de gama media. Web/PWA queda fuera.

## Instrumentación

Registrar por pista: red, perfil, fuente elegida, estado de verificación,
latencia, peticiones, memoria antes/después, temperatura percibida y resultado
de descarga. Ningún caso se marca aprobado sin ejecutarlo en ambos targets.

## Matriz de 30 casos

| # | Caso | Evidencia esperada | Estado |
|---:|---|---|---|
| 1 | Explícita con variante limpia | Coincide edición catálogo | Pendiente |
| 2 | Limpia con variante explícita | Coincide edición catálogo | Pendiente |
| 3 | Catálogo sin señal de edición | Selector si compiten variantes | Pendiente |
| 4 | ISRC exacto | `verified` | Pendiente |
| 5 | ISRC diferente | Nunca descarga de un toque | Pendiente |
| 6 | Canal Topic y duración exacta | `verified` si edición compatible | Pendiente |
| 7 | Cover | `rejected` | Pendiente |
| 8 | Directo | `rejected` | Pendiente |
| 9 | Nightcore | `rejected` | Pendiente |
| 10 | Sped up | `rejected` | Pendiente |
| 11 | Slowed + reverb | `rejected` | Pendiente |
| 12 | Instrumental | `rejected` | Pendiente |
| 13 | Karaoke | `rejected` | Pendiente |
| 14 | Remix no solicitado | `rejected` | Pendiente |
| 15 | Radio edit incompatible | edición/duración contradictoria | Pendiente |
| 16 | Vídeo musical con intro | selector o rechazo | Pendiente |
| 17 | Remaster solicitado por catálogo | coincidencia correcta | Pendiente |
| 18 | Remaster no solicitado | selector o rechazo | Pendiente |
| 19 | Colaboración con `feat.` | artista normalizado correcto | Pendiente |
| 20 | Dos artistas principales | artista normalizado correcto | Pendiente |
| 21 | Título de una palabra | sin falso positivo conocido | Pendiente |
| 22 | Título común | selector | Pendiente |
| 23 | Título con símbolos | normalización estable | Pendiente |
| 24 | Título japonés | identidad Deezer conservada | Pendiente |
| 25 | Opening anime con modo apagado | flujo musical normal | Pendiente |
| 26 | Opening anime con modo activado | candidato completo correcto | Pendiente |
| 27 | Resultado no disponible | invalida caché, solo otro verificado | Pendiente |
| 28 | Datos móviles | máximo cinco búsquedas ligeras | Pendiente |
| 29 | Batería menor de 20% sin carga | cola pausada | Pendiente |
| 30 | 20 pistas consecutivas en Wi‑Fi | sin crecimiento sostenido de memoria | Pendiente |

## Aceptación de artefactos

- ZIP portable inicia en Windows 10 y 11 sin Python/Node externos.
- APK conserva `com.mhl.music`, certificado vigente y `versionCode` 27.
- `MHL-Music-Android.json` coincide con nombre, versión y SHA-256 del APK.
