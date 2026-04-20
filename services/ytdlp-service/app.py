import json
import threading
from contextlib import asynccontextmanager

from config import ALLOWED_ORIGINS, TEMP_DIR
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from modules.cookies import cookie_checker_loop
from routes.deezer import register_deezer_routes
from routes.download import register_download_routes
from routes.health import register_health_routes
from routes.internal import register_internal_routes
from routes.resolve import register_resolve_routes
from routes.search import register_search_routes
from routes.telegram import register_telegram_routes


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Lifecycle events: startup and shutdown."""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=cookie_checker_loop, daemon=True).start()
    yield


app = FastAPI(
    title="MHL ytdlp service",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)

# Registrar todas las rutas
register_health_routes(app)
register_search_routes(app)
register_resolve_routes(app)
register_download_routes(app)
register_deezer_routes(app)
register_internal_routes(app)
register_telegram_routes(app)


@app.exception_handler(HTTPException)
async def http_error_handler(_, exc: HTTPException) -> JSONResponse:
    """Maneja excepciones HTTP con formato consistente."""
    return JSONResponse(
        status_code=exc.status_code, content={"success": False, "error": exc.detail}
    )
