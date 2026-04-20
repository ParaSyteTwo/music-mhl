# Testing

## Tests Unitarios

### Setup
```bash
pip install pytest pytest-cov
```

### Ejecutar
```bash
# Todos los tests
pytest tests/

# Con reporte de cobertura
pytest tests/ --cov=modules --cov=routes

# Tests específicos
pytest tests/test_auth.py
pytest tests/test_cache.py::test_cache_key
```

### Tests Disponibles

**test_auth.py**
- ✅ Base64 URL-safe encode/decode
- ✅ Firma y verificación de tokens HMAC-SHA256
- ✅ Estructura de payload correcto

**test_cache.py**
- ✅ Normalización de claves
- ✅ Almacenamiento y recuperación
- ✅ Claves inexistentes retornan None

**test_rate_limit.py**
- ✅ Primera solicitud pasa
- ✅ Exceso de ráfaga es rechazado
- ✅ Diferentes IPs tienen límites separados

**test_utils.py**
- ✅ Normalización de búsquedas
- ✅ Limpieza de nombres de archivo
- ✅ Detección de anime

## Testing Manual Local

### 1. Arranca el servidor
```bash
cd services/ytdlp-service
uvicorn app:app --reload --port 8000
```

Debería ver:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

### 2. Exporta variable de entorno (para tests)
```bash
export SERVICE_API_KEY="test-key-12345"
```

### 3. Prueba Health Check
```bash
curl -X GET "http://localhost:8000/health" \
  -H "Authorization: Bearer test-key-12345"

# Respuesta esperada:
{
  "ok": true,
  "service": "ytdlp-service",
  "issues": [],
  "cookies_configured": false,
  "resolve_cache_entries": 0,
  "resolve_cache_max": 100000,
  "maintenance": false,
  "maintenance_until": null
}
```

### 4. Prueba Búsqueda
```bash
curl -X GET "http://localhost:8000/search?q=beatles%20yellow" \
  -H "Authorization: Bearer test-key-12345"

# Debería retornar lista de candidatos con videoId, title, channel, duration
```

### 5. Prueba Resolve (extremo a extremo)
```bash
curl -X POST "http://localhost:8000/resolve" \
  -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Yellow Submarine",
    "artist": "The Beatles",
    "album": "Revolver",
    "duration": 240,
    "format": "mp3"
  }'

# Respuesta:
{
  "success": true,
  "videoId": "M7lc1BCxL00",
  "title": "Yellow Submarine",
  "duration": 245,
  "format": "mp3",
  "fileName": "Yellow Submarine - The Beatles.mp3",
  "cached": false,
  "token": "eyJ...",
  "expiresAt": "2026-04-20T12:34:56.789Z"
}
```

### 6. Prueba Descarga (con token del paso anterior)
```bash
# Usando token anterior:
curl -X GET "http://localhost:8000/download?token=PEGA_TOKEN_AQUI" \
  -o song.mp3

# Verifica archivo:
file song.mp3
ls -lh song.mp3
```

### 7. Prueba Deezer Search
```bash
curl -X POST "http://localhost:8000/deezer" \
  -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search",
    "query": "Beatles Yellow Submarine",
    "limit": 5
  }'

# Retorna tracks con metadata Deezer
```

### 8. Prueba Candidates (con scoring)
```bash
curl -X POST "http://localhost:8000/candidates" \
  -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Yellow Submarine",
    "artist": "The Beatles",
    "album": "Revolver",
    "duration": 240
  }'

# Retorna candidatos ordenados por score
{
  "success": true,
  "candidates": [
    {
      "videoId": "M7lc1BCxL00",
      "title": "The Beatles - Yellow Submarine",
      "channel": "The Beatles",
      "duration": 245,
      "score": 180,
      "label": "original probable",
      "confidence": "alta"
    },
    ...
  ]
}
```

## Testing con Insomnia/Postman

Importa colección:
```json
{
  "name": "MHL ytdlp-service",
  "requests": [
    {
      "name": "Health",
      "method": "GET",
      "url": "http://localhost:8000/health",
      "headers": {
        "Authorization": "Bearer test-key-12345"
      }
    },
    {
      "name": "Search",
      "method": "GET",
      "url": "http://localhost:8000/search?q=beatles",
      "headers": {
        "Authorization": "Bearer test-key-12345"
      }
    },
    {
      "name": "Resolve",
      "method": "POST",
      "url": "http://localhost:8000/resolve",
      "headers": {
        "Authorization": "Bearer test-key-12345",
        "Content-Type": "application/json"
      },
      "body": {
        "title": "Yellow Submarine",
        "artist": "The Beatles"
      }
    }
  ]
}
```

## Validación de Comportamiento

### Chequear que endpoints responden igual que antes

```bash
# Antes (app.py original):
# GET /health → ok, issues, cookies_configured, etc
# POST /resolve → videoId, token, expiresAt

# Después (refactorizado):
# Mismo response → ✅ IGUAL
```

### Rate Limiting
```bash
# Hacer >8 solicitudes en 60s:
for i in {1..10}; do
  curl http://localhost:8000/health \
    -H "Authorization: Bearer test-key-12345" \
    -H "X-Forwarded-For: 192.168.1.1"
  echo ""
done

# Debería ver:
# - Primeras 8: 200 OK
# - 9a en adelante: 429 Too Many Requests
```

### Cache
```bash
# Primera llamada (sin cache):
time curl -X POST http://localhost:8000/resolve \
  -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"title":"X","artist":"Y"}'

# Segunda llamada misma canción (desde cache):
time curl -X POST http://localhost:8000/resolve \
  -H "Authorization: Bearer test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"title":"X","artist":"Y"}'

# Segunda debería ser MUCHO más rápida
# Verifica en respuesta: "cached": true
```

## Logs y Debugging

### Ver logs del servidor
```bash
# En otra terminal, mientras corres uvicorn:
tail -f /tmp/ytdlp-service/*

# Ver errores recientes:
grep ERROR /tmp/ytdlp-service/app.log
```

### Debug individual
```bash
# Edita test_utils.py y agrega print():
def test_normalize_search_term():
    result = normalize_search_term("Test")
    print(f"RESULT: {result}")
    assert result == "test"

# Corre pytest con -s:
pytest tests/test_utils.py -s
```

## Checklist Final

Antes de desplegar:
- [ ] `pytest tests/` pasa sin errores
- [ ] `uvicorn app:app --reload` arranca sin errores
- [ ] `GET /health` retorna ok=true
- [ ] `POST /resolve` retorna videoId + token
- [ ] `GET /download?token=...` descarga archivo
- [ ] Rate limit funciona (>8 solicitudes fallan)
- [ ] Cache funciona ("cached": true en segunda llamada)
- [ ] Sin advertencias de import en logs

## Troubleshooting

### "ModuleNotFoundError: No module named 'config'"
```bash
# Problema: No está en PYTHONPATH
# Solución: Corre desde directorio correcto
cd services/ytdlp-service
python -m pytest tests/
```

### "Address already in use :8000"
```bash
# Problema: Puerto 8000 ocupado
# Solución:
lsof -i :8000
kill -9 <PID>

# O usa otro puerto:
uvicorn app:app --port 8001
```

### "ImportError: cannot import name..."
```bash
# Problema: Módulo no existe
# Solución: Verifica que archivos están creados
ls modules/
ls routes/

# Y que no hay circular imports
python -c "import app"  # Debería no dar errores
```

¡Listo! Ahora puedes testear localmente antes de hacer deploy a Fly.io.
