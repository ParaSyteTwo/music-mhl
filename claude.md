# CLAUDE.md — Project Rules
> Project: MHL Music
> Stack: TypeScript / React + Tauri v2 + Capacitor + FastAPI
> Last updated: 2026-04-28

## Stack & Constraints

| Plataforma | Technology | Notes |
|-----------|-----------|-------|
| Frontend | React 18 + Vite + TypeScript | Compartido Web + Desktop + Android |
| Desktop | Tauri v2 (Rust) | yt-dlp.exe bundleado localmente — sin backend Fly.io |
| Android | Capacitor 8 + plugin nativo | Ya funciona al 100% — no tocar sin razón |
| Backend | FastAPI (Fly.io) | Solo para Web/PWA — Desktop NO lo usa |
| State | Zustand 5 | Compartido en todo el frontend |
| PWA | vite-plugin-pwa | Solo Web/PWA |

**Prohibido:**
- Llamar backend Fly.io desde Tauri Desktop
- `__TAURI_INTERNALS__` para detectar Tauri (no existe en v2) → usar `src/lib/platform/index.ts`
- `decorations: false` en tauri.conf.json
- Tocar código Android sin motivo
- Subir binarios a git (yt-dlp.exe, ffmpeg.exe)

## Code Generation Rules

1. **Plan first**: Antes de escribir código, generar un plan de archivos a crear/modificar
2. **No AI Slop**: Sin abstracciones innecesarias, sin comentarios boilerplate, sin TODOs placeholder
3. **Confidence scoring**: Si no estás seguro de una API, decir el confidence score (0-100%)
4. **Tests required**: Cada feature debe incluir tests unitarios
5. **Error handling**: Todo async envuelto en try/catch con respuestas de error tipadas

## Workflow — SDD Super Prompt

Para cada request de feature, estructurar como:

```
[CONTEXTO] Referencia @PRD.md y @TECH_DESIGN.md para la sección relevante
[MISIÓN ACTUAL] La tarea específica a implementar
[REGLAS DE ORO]
  - Plan antes de código
  - Cambios atómicos (un archivo/concern por PR/commit)
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

## Referencias

- Requisitos completos: @PRD.md
- Decisiones de arquitectura: @TECH_DESIGN.md
- Reglas globales: ~/.claude/CLAUDE.md
