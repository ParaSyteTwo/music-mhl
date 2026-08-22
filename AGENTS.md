# AGENTS.md — Project Rules
> Project: MHL Music
> Active stack: TypeScript / React + pywebview/Python + Capacitor/Android
> Legacy retained code: Web/PWA + FastAPI
> Last updated: 2026-06-15

## ⚠️ Plataformas activas: SOLO Desktop y Android. La web está fuera de scope.

**Hecho el 2026-06-11 (anime 1.4.2, retroactivo):** el plan de la feature anime
asumió un path web que **no se entrega**. La web está abandonada desde hace
tiempo — la IP del servidor de Google rechaza el tráfico de yt-dlp y la
experiencia web no funciona en la práctica. El usuario dejó la web de lado
explícitamente.

**Implicación para todas las IAs/agents que lean este archivo:**

- Las **plataformas en uso real son DOS**: Desktop (pywebview + Python
  embebido) y Android (Capacitor + plugin nativo). Cualquier feature nueva se
  implementa y prueba solo en estos dos targets.
- El branch web del switch de plataforma en `src/lib/api/animeApi.ts` (y
  cualquier código equivalente) es **código muerto en producción**. No
  inviertas tiempo en ampliarlo, probarlo como producto ni documentarlo como
  plataforma soportada.
- El backend FastAPI en `services/ytdlp-service/` existe pero **no se
  despliega ni se usa** en el flujo real. El Desktop llama directo a AniList /
  animethemes desde Python. No agregues features nuevas al backend pensando
  en que la web las va a consumir. Si una feature nueva necesita lógica
  compartida, ponla en el bridge de Desktop (Python) o en el plugin nativo
  Android — no en FastAPI.
- Cuando armes planes / SDD / docs, **marca explícitamente "alcance: Desktop
  + Android"** al inicio. No asumas que "Frontend" implica web — implica
  Desktop (pywebview) + Android (Capacitor), y el código compartido vive en
  `src/`.

**Síntomas de que estás cayendo en la trampa otra vez:**

- El plan dice "verificar en web" o "desplegar en Vercel" o "configurar el
  build para PWA" — para. La web no se entrega.
- Estás escribiendo tests E2E con `fetch` y `${getRailwayUrl()}/...` —
  ese path está muerto. Si los tests pasan no significa nada porque nadie
  corre ese path.
- Estás agregando un endpoint al FastAPI "para que la web lo consuma" —
  nadie lo va a consumir. Ponlo en el bridge Desktop o plugin Android.

## Anime Search Activation Contract

- El modo anime está desactivado por defecto.
- Nunca se habilita automáticamente por una búsqueda, reproducción, artista o
  heurística de supuesto interés.
- El usuario debe activarlo explícitamente desde Ajustes. La elección se
  persiste.
- Las heurísticas `anime-feel` sólo pueden cambiar el tipo de resultados cuando
  ese ajuste ya está habilitado.
- Una query ambigua nunca debe alterar la búsqueda musical normal de un usuario
  que no haya optado por la feature.

| Plataforma | Estado | Technology | Notes |
|-----------|--------|-----------|-------|
| **Desktop** | ✅ ACTIVA | pywebview + PyInstaller | yt-dlp.exe y ffmpeg.exe bundleados. **Target principal de release.** |
| **Android** | ✅ ACTIVA | Capacitor 8 + plugins nativos | Modificar solo con una necesidad concreta y pruebas proporcionales. |
| ~~Web/PWA~~ | ❌ FUERA DE SCOPE | (código legado) | No se entrega. No invertir tiempo. |
| Frontend | Compartido | React 18 + Vite + TypeScript | Compartido entre Desktop y Android (no web). |
| Backend | (legado) | FastAPI | No se despliega ni forma parte de QA o releases activas. |
| State | Compartido | Zustand 5 | Compartido en todo el frontend. |
| PWA | (eliminada) | Restos históricos | No hay manifest ni service worker activos. |

**Prohibido:**
- Publicar o crear CUALQUIER release/prerelease en GitHub sin adjuntar obligatoriamente el manifiesto `MHL-Music-Android.json` junto con el APK y el ZIP portable.
- Llamar al backend legado desde Desktop o Android
- Asumir web como plataforma soportada en planes / SDD / docs
- Crear endpoints nuevos en `services/ytdlp-service/` "por si la web los
  necesita" — el Desktop y Android los necesitan en su propio código
- Tocar código Android sin motivo
- Subir los binarios Desktop `yt-dlp.exe` o `ffmpeg.exe` a git
- Cambiar el certificado de firma Android o publicar un APK con otra firma
- Reutilizar `versionCode` en una release normal
- Crear otro mecanismo de auto-update que contradiga @ANDROID_UPDATE_CONTRACT.md

## Code Generation Rules

1. **Plan first**: Antes de escribir código, generar un plan de archivos a crear/modificar
2. **No AI Slop**: Sin abstracciones innecesarias, sin comentarios boilerplate, sin TODOs placeholder
3. **Confidence scoring**: Si no estás seguro de una API, decir el confidence score (0-100%)
4. **Tests required**: Cada feature debe incluir tests proporcionales al riesgo
5. **Error handling**: Las fronteras async de red, bridge, filesystem y plugins
   deben capturar errores y devolver fallos tipados
Para cada request de feature, estructurar como:

```
[CONTEXTO] Referencia @PRD.md y @TECH_DESIGN.md para la sección relevante
[MISIÓN ACTUAL] La tarea específica a implementar
[REGLAS DE ORO]
  - Plan antes de código
  - Cambios atómicos (un concern coherente por PR/commit)
  - Tests junto al código (nunca después)
  - No deps externas sin aprobación
[CONFIDENCIA] Score en decisiones clave
```

## PEV Execution Cycle

1. **Plan**: Generar plan de implementación (archivos, funciones, data flow)
2. **Execute**: Implementar un slice a la vez — no commits big-bang
3. **Verify**: Escribir/ejecutar tests; confirmar criteria de aceptación del PRD.md

## Commit Convention

Format: `<type>: <description>`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

## Release Artifacts

- Cada release debe generar un ZIP portable de Windows y un APK Android.
- Ambos artefactos deben quedar en la carpeta `release/` del proyecto.
- No generar instalador de Windows salvo petición explícita.
- Publicar cambios incrementales como prerelease hasta que el conjunto de
  mejoras y correcciones justifique una release estable.

## Android Update Compatibility

`@ANDROID_UPDATE_CONTRACT.md` es normativo para toda iteración Android posterior a `1.3.5`.

- Fuente única: GitHub Releases de `ParaSyteTwo/music-mhl`.
- Cada release Android debe incluir `MHL-Music-Android.json` y `MHL-Music-{versionName}.apk`.
- Identidad de build: `versionCode + versionName + SHA-256`.
- Incrementar siempre `versionCode` en releases normales.
- Conservar `applicationId = com.mhl.music` y el certificado de firma actual.
- Un asset estable nuevo o reemplazado debe madurar 7 días desde `asset.updated_at`.
- El canal beta acepta cualquier release publicada, estable o prerelease, desde el minuto cero.
- No permitir descarga o instalación estable durante su periodo de maduración.
- Validar digest, package, versión y certificado antes de instalar.
- La instalación siempre requiere confirmación del sistema Android.
- Implementar por slices en el orden definido por el contrato; no saltar directamente al instalador.

## Referencias

- Requisitos completos: @PRD.md
- Decisiones de arquitectura: @TECH_DESIGN.md
- Contrato de compatibilidad Android: @ANDROID_UPDATE_CONTRACT.md
- Índice documental y fuentes de verdad: @docs/README.md
- Convenciones del backend legado, solo si se mantiene expresamente:
  @docs/legacy/backend-conventions.md
- Reglas globales: ~/.Codex/AGENTS.md
