# Backend conventions — ytdlp-service (FastAPI)

> Legacy-only reference for `services/ytdlp-service/`.
> Last updated: 2026-06-15.
>
> FastAPI is outside the active Desktop + Android product. Use this document
> only when maintenance of the retained legacy service is explicitly requested.
> Do not add active product features here.

## Canonical route skeleton

Every new `routes/<name>.py` follows the same shape. Reference:
`routes/download.py:71-79` and `routes/search.py:31-46`.

```python
from modules.auth import require_service_key
from modules.rate_limit import check_rate_limit, get_client_ip
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class MyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    field: str = Field(default="", max_length=200)


def register_<name>_routes(app: FastAPI) -> None:
    @app.post("/<name>/<action>")
    async def handler(
        payload: MyRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        # 1. Auth
        require_service_key(authorization)

        # 2. Rate limit — IMPORTANT: 1-arg, no scope
        ok, message, retry_after = check_rate_limit(get_client_ip(request))
        if not ok:
            headers = {"Retry-After": str(retry_after)} if retry_after else None
            raise HTTPException(status_code=429, detail=message, headers=headers)

        # 3. Input validation
        ...

        # 4. Business logic wrapped in try/except → 502
        try:
            result = await ...
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"...: {exc}") from exc

        return {"success": True, ...}
```

`register_*_routes(app)` is then called from `app.py` alongside the
existing route registrations.

## Rate limit — `check_rate_limit` is 1-arg, NOT 2-arg

The current `modules/rate_limit.py` (commit `c8cf564` and later)
exposes:

```python
def check_rate_limit(ip: str) -> tuple[bool, str, int | None]: ...
```

There is **no `scope` parameter**. The internal in-memory store keys
on `ip` only. Do not write a helper like
`def _enforce_rate_limit(request, scope): check_rate_limit(ip, scope)`
— it will `TypeError` at runtime. The canonical pattern is to inline
the 1-arg call directly in the route (see snippet above).

If a future feature needs per-route buckets, the fix is to extend
`modules/rate_limit.py` itself (out of scope for individual feature
slices). Do not work around it with a custom scope string.

## HTTP client — `httpx`, not `aiohttp`

`services/ytdlp-service/requirements.txt` only contains:

```
fastapi==0.116.1
uvicorn==0.35.0
imageio-ffmpeg==0.6.0
httpx==0.28.1
yt-dlp @ git+https://github.com/yt-dlp/yt-dlp.git
```

`aiohttp` is **not** in requirements, and `CLAUDE.md` explicitly
forbids assuming libraries. Use `httpx.AsyncClient` like
`modules/deezer.py:12` does:

```python
async with httpx.AsyncClient(timeout=10) as client:
    res = await client.post(url, json=payload)
    res.raise_for_status()
    return res.json()
```

## Test patterns

### TestClient + the global `HTTPException` handler

`app.py` registers a global handler that wraps `HTTPException` into
`{"success": False, "error": "..."}`. The `tests/conftest.py` exposes
a `client` fixture wired to that real `app`. If a test creates its
**own** `FastAPI()` (e.g. for isolation), it must also register the
same handler, or the `body["success"] is False` assertion will fail
with `KeyError: 'success'`:

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

def _register_routes(client_app: FastAPI) -> None:
    @client_app.exception_handler(HTTPException)
    async def _http_error_handler(_, exc):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail},
        )
    register_anime_routes(client_app)
```

### Bypassing auth + rate limit (per-test)

Mirror the `test_costly_routes.py` style — `monkeypatch` the names
**as imported into the route module** (not into the originals):

```python
@pytest.fixture
def allow_request(monkeypatch):
    monkeypatch.setattr(anime_routes, "require_service_key", lambda _: None)
    monkeypatch.setattr(anime_routes, "check_rate_limit", lambda ip: (True, "", None))
```

Both lambdas must match the real signatures **exactly** (1-arg for
both). Using a permissive 2-arg lambda (`lambda ip, scope: ...`) on
`check_rate_limit` will silently hide a signature-mismatch bug in
production code (the verifier in Slice 1 caught this exact bug).
**Always include at least one test per route that exercises the real
`check_rate_limit` (no monkeypatch) and asserts a visible side
effect** — e.g. 429 after `RATE_LIMIT_BURST` requests.

### Resetting the rate-limit store between tests

The store is a module-level dict in `modules/rate_limit.py`:

```python
@pytest.fixture
def fresh_rate_store(monkeypatch):
    import modules.rate_limit as rl
    monkeypatch.setattr(rl, "_rate_store", {})
```

### Mocking `httpx.AsyncClient` (no `respx` / `aioresponses` available)

The project does **not** depend on `respx` or `aioresponses`. Use
`unittest.mock` directly:

```python
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

@asynccontextmanager
async def fake_client(*_a, **_k):
    yield MagicMock(post=AsyncMock(side_effect=[resp1, resp2]))

with patch.object(anime_client.httpx, "AsyncClient", fake_client):
    result = asyncio.run(anime_client.search_anime("x", 5))
```

`patch.object(module, "AsyncClient", ...)` is the right call —
`patch(anime_client.httpx, "AsyncClient", ...)` will fail with
`TypeError: Need a valid target to patch` because `unittest.mock.patch`
requires a string target for bare-module inputs.

### Ad-hoc async calls in sync tests

Pytest in this project is run without `pytest-asyncio` for most
suites. Call a coroutine with `asyncio.run(...)` rather than letting
it sit unawaited:

```python
def test_thing():
    with pytest.raises(ValueError):
        asyncio.run(anime_client.search_anime("", 5))
```

Without `asyncio.run` the function returns a coroutine (not a list),
your `len(result)` will `TypeError`, and you'll get a
`RuntimeWarning: coroutine ... was never awaited`.

## `__pycache__` is shared across worktrees

`pytest_cache` and `__pycache__` are picked up across worktrees on
Windows. If a `Read` shows a different module than the on-disk
truth, the issue is stale `.pyc`, not the file. Clear with:

```bash
python -c "import shutil, os; [shutil.rmtree(os.path.join(r,d), ignore_errors=True) for r,_,fs in os.walk('.') for d in fs if d=='__pycache__']"
```

(`mavis-trash` is also fine, but the one-liner is more surgical.)

## Registering routes in `app.py`

After creating a new `routes/<name>.py`, add two lines in `app.py`:

1. `from routes.<name> import register_<name>_routes`
2. `register_<name>_routes(app)` in the route-registration block

Both go **alphabetically** if the existing block is alphabetical, or
in the existing style. The error envelope handler
(`@app.exception_handler(HTTPException)`) is global and needs no
per-route changes.
