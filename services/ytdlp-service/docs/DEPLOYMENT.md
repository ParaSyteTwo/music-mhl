# Deployment a Fly.io

## Checklist Pre-Deploy

- [ ] Tests locales pasan: `pytest tests/`
- [ ] Servidor corre: `uvicorn app:app --port 8000`
- [ ] Todos los endpoints responden
- [ ] Variables de entorno .env configuradas
- [ ] Git status limpio: `git status`

## Setup Fly.io (Primera vez)

### 1. Instalar Fly CLI
```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login
```bash
fly auth login
# Abre navegador, autenticarte con Fly.io
```

### 3. Crear App
```bash
cd services/ytdlp-service
fly launch
# Preguntas:
# - App name: ytdlp-service (o tu nombre)
# - Region: choose one (ej: sjc = San José)
# - Postgres: No (usamos solo Python)
```

Esto crea `fly.toml`.

### 4. Configurar Variables de Entorno
```bash
fly secrets set SERVICE_API_KEY="tu-clave"
fly secrets set DOWNLOAD_SIGNING_SECRET="tu-secret"
fly secrets set TELEGRAM_BOT_TOKEN="token" (opcional)
fly secrets set TELEGRAM_CHAT_ID="id" (opcional)
fly secrets set YOUTUBE_COOKIES_B64="base64-cookies"
fly secrets set YOUTUBE_COOKIES_B64_2="base64-cookies" (opcional)
fly secrets set YOUTUBE_COOKIES_B64_3="base64-cookies" (opcional)
fly secrets set ALLOWED_ORIGINS="https://tuapp.com"
```

Verificar configuradas:
```bash
fly secrets list
```

## Deploy (Cada vez)

### Opción 1: Automático desde Git
```bash
# Asegúrate de estar en rama main
git add .
git commit -m "feat: descripción del cambio"
git push origin main

# Si configuraste GitHub Actions en fly.toml, se deploya automáticamente
```

### Opción 2: Manual
```bash
fly deploy
```

Monitoria:
```bash
fly logs --follow
```

## Validación Post-Deploy

### 1. Health Check
```bash
curl https://ytdlp-service.fly.dev/health \
  -H "Authorization: Bearer $SERVICE_API_KEY"

# Respuesta esperada:
{
  "ok": true,
  "service": "ytdlp-service",
  "issues": [],
  "cookies_configured": true,
  "maintenance": false
}
```

### 2. Búsqueda
```bash
curl -X GET "https://ytdlp-service.fly.dev/search?q=beatles%20yellow" \
  -H "Authorization: Bearer $SERVICE_API_KEY"
```

### 3. Resolve (de extremo a extremo)
```bash
curl -X POST "https://ytdlp-service.fly.dev/resolve" \
  -H "Authorization: Bearer $SERVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Yellow Submarine",
    "artist": "The Beatles",
    "format": "mp3",
    "duration": 240
  }'
```

Debería retornar videoId + token.

### 4. Descargar (con el token del paso anterior)
```bash
curl -X GET "https://ytdlp-service.fly.dev/download?token=TOKEN_AQUI" \
  -o song.mp3

# Verifica: file song.mp3
```

## Rollback

Si algo falla:
```bash
# Ver historial de deploys
fly releases

# Rollback a versión anterior
fly releases rollback
```

## Monitoring

### Logs en tiempo real
```bash
fly logs --follow
```

### Metricas
```bash
fly status
```

### SSH a la máquina (para debugging)
```bash
fly ssh console
# Dentro del container:
ps aux
df -h
tail -f /tmp/ytdlp-service/*
```

## Troubleshooting

### "502 Bad Gateway"
```bash
# Ver logs
fly logs --follow

# Probable: Script de inicio falla
# Solución: Verificar requirements.txt y Dockerfile
```

### "Connection refused"
```bash
# Probable: Uvicorn no escucha en puerto correcto
# Verificar en Dockerfile:
EXPOSE 8000
# Y en app: app.run(host="0.0.0.0", port=8000)
```

### Cookies expiradas
```bash
# Enviar nuevas cookies por Telegram:
# Chat privado con bot → /login → Enviar cookies.txt

# O manualmente:
fly secrets set YOUTUBE_COOKIES_B64="nuevas-cookies"
fly deploy
```

## Scaling

El plan gratuito de Fly.io:
- 1 máquina compartida (siempre viva)
- 3GB RAM
- 30GB almacenamiento

Para más recursos:
```bash
# Upgrade plan
fly scale count 2  # 2 máquinas
fly scale vm performance-1  # VM más potente
```

## Costos

| Plan | Precio | Máquinas | RAM |
|------|--------|----------|-----|
| Gratuito | $0/mes | 1 (compartida) | 3GB |
| Pay-as-you-go | $0.003-0.05/hora | Ilimitadas | Ilimitada |

Para este proyecto, **gratuito es más que suficiente**.

## Dockerfile (Sin cambios)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Variables Ambiente (Requeridas)

```env
SERVICE_API_KEY=...
DOWNLOAD_SIGNING_SECRET=...
YOUTUBE_COOKIES_B64=...
TOKEN_TTL_SECONDS=120
MAX_CONCURRENT_DOWNLOADS=3
RATE_LIMIT_BURST=8
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_DAILY=250
TEMP_DIR=/tmp/ytdlp-service
ALLOWED_ORIGINS=*
```

## Workflow Recomendado

```bash
# 1. Cambios locales
git checkout -b feature/nueva-cosa
# ... edita, testa ...
pytest tests/

# 2. Local testing
uvicorn app:app --reload
# Prueba endpoints en http://localhost:8000/health

# 3. Commit
git add .
git commit -m "feat: descripción"

# 4. Push
git push origin feature/nueva-cosa

# 5. Pull Request
gh pr create

# 6. Review + Merge a main
gh pr merge --auto

# 7. Deploy automático a Fly.io
# (si configuraste CI/CD)
```

## Soporte

Si algo falla en Fly.io:
1. Mira logs: `fly logs --follow`
2. Conecta SSH: `fly ssh console`
3. Revisa status: `fly status`
4. Rollback si es necesario: `fly releases rollback`

¡Listo! Ahora estás en producción en Fly.io con 1 máquina siempre viva y completamente gratis.
