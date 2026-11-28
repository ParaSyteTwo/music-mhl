"""
MHL Music — Python bridge expuesto al frontend React via pywebview.
Todas las llamadas externas (Deezer, YouTube/yt-dlp, filesystem) pasan por aquí.
"""
import base64
from collections import OrderedDict, deque
import concurrent.futures
import html as html_lib
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, urljoin, urlparse

# CREATE_NO_WINDOW para evitar popup de consola en Windows
CREATE_NO_WINDOW = 0x08000000 if sys.platform == 'win32' else 0

APP_VERSION = '1.5.7-beta.3'

import requests
from requests.adapters import HTTPAdapter

from settings import settings

# ── HTTP Connection Pooling ───────────────────────────────────────────────────

_ORIG_REQUESTS_GET = requests.get
_ORIG_REQUESTS_POST = requests.post

_http_session = requests.Session()
_http_adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32)
_http_session.mount('https://', _http_adapter)
_http_session.mount('http://', _http_adapter)


def _http_get(url: str, **kwargs):
    if requests.get is not _ORIG_REQUESTS_GET:
        return requests.get(url, **kwargs)
    return _http_session.get(url, **kwargs)


def _http_post(url: str, **kwargs):
    if requests.post is not _ORIG_REQUESTS_POST:
        return requests.post(url, **kwargs)
    return _http_session.post(url, **kwargs)


# ── Caché LRU de portadas en memoria ──────────────────────────────────────────

_COVER_CACHE_MAX_ENTRIES = 16
_COVER_CACHE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_COVER_MAX_REDIRECTS = 3
_cover_cache: OrderedDict[str, bytes] = OrderedDict()
_cover_cache_lock = threading.Lock()


def _is_public_ip(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip_obj.is_global
        and not ip_obj.is_private
        and not ip_obj.is_loopback
        and not ip_obj.is_link_local
        and not ip_obj.is_unspecified
        and not ip_obj.is_multicast
        and not ip_obj.is_reserved
    )


def _is_safe_cover_url(cover_url: str) -> bool:
    if not cover_url or not isinstance(cover_url, str):
        return False
    parsed = urlparse(cover_url)
    if parsed.scheme != 'https' or not parsed.netloc or not parsed.hostname:
        return False

    host = parsed.hostname.rstrip('.').lower()
    if (
        not host
        or host == 'localhost'
        or host.endswith('.localhost')
        or host.endswith('.local')
        or host.endswith('.internal')
    ):
        return False

    try:
        ip_obj = ipaddress.ip_address(host)
        return _is_public_ip(ip_obj)
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        for info in infos:
            addr = info[4][0]
            ip_obj = ipaddress.ip_address(addr)
            if not _is_public_ip(ip_obj):
                return False
    except OSError:
        # Permite dominios de prueba en entornos offline/sandbox cuando _http_get está mockeado
        pass

    return True


def _is_valid_image_bytes(data: bytes) -> bool:
    if len(data) <= 32:
        return False
    return data.startswith(b'\xff\xd8\xff') or data.startswith(b'\x89PNG\r\n\x1a\n')


def _read_bounded_cover_content(res) -> bytes | None:
    headers = getattr(res, 'headers', None)
    if headers is not None and hasattr(headers, 'get'):
        raw_cl = headers.get('Content-Length')
        if isinstance(raw_cl, (str, int)):
            try:
                if int(raw_cl) > _COVER_CACHE_MAX_BYTES:
                    return None
            except ValueError:
                pass

    buf = bytearray()
    iter_content = getattr(res, 'iter_content', None)
    if callable(iter_content):
        for chunk in iter_content(chunk_size=65536):
            if not isinstance(chunk, (bytes, bytearray)) or not chunk:
                continue
            if len(buf) + len(chunk) > _COVER_CACHE_MAX_BYTES:
                return None
            buf.extend(chunk)

    if buf:
        return bytes(buf)

    if not isinstance(res, requests.Response):
        raw = getattr(res, 'content', None)
        if isinstance(raw, (bytes, bytearray)):
            if len(raw) > _COVER_CACHE_MAX_BYTES:
                return None
            return bytes(raw)

    return None


def _fetch_cover_bytes(cover_url: str) -> bytes | None:
    if not _is_safe_cover_url(cover_url):
        return None

    with _cover_cache_lock:
        cached = _cover_cache.get(cover_url)
        if cached is not None:
            _cover_cache.move_to_end(cover_url)
            return cached

    current_url = cover_url
    try:
        for _ in range(_COVER_MAX_REDIRECTS + 1):
            res = _http_get(current_url, timeout=10, stream=True, allow_redirects=False)
            try:
                status_code = getattr(res, 'status_code', None)
                if isinstance(status_code, int) and status_code in (301, 302, 303, 307, 308):
                    headers = getattr(res, 'headers', None)
                    location = headers.get('Location') if headers is not None and hasattr(headers, 'get') else None
                    if not isinstance(location, str) or not location:
                        return None
                    next_url = urljoin(current_url, location)
                    if not _is_safe_cover_url(next_url):
                        return None
                    current_url = next_url
                    continue

                if not res.ok:
                    return None

                content = _read_bounded_cover_content(res)
                if not content or not _is_valid_image_bytes(content):
                    return None

                with _cover_cache_lock:
                    _cover_cache[cover_url] = content
                    _cover_cache.move_to_end(cover_url)
                    while len(_cover_cache) > _COVER_CACHE_MAX_ENTRIES:
                        _cover_cache.popitem(last=False)
                return content
            finally:
                close_fn = getattr(res, 'close', None)
                if callable(close_fn):
                    close_fn()
        return None
    except Exception:
        return None


# ── Directorio temporal seguro para audio (Zero-Base64) ──────────────────────

_TEMP_AUDIO_DIR = Path(tempfile.gettempdir()) / 'mhl_audio_cache'
_TEMP_AUDIO_MAX_AGE_SECONDS = 3600.0


def _cleanup_stale_temp_audio_dirs() -> None:
    try:
        if not _TEMP_AUDIO_DIR.exists():
            return
        now = time.time()
        for entry in _TEMP_AUDIO_DIR.iterdir():
            try:
                if (now - entry.stat().st_mtime) > _TEMP_AUDIO_MAX_AGE_SECONDS:
                    if entry.is_dir():
                        shutil.rmtree(entry, ignore_errors=True)
                    else:
                        entry.unlink(missing_ok=True)
            except Exception:
                continue
    except Exception:
        pass


def _resolve_safe_temp_audio_path(temp_path: str) -> Path | None:
    if not temp_path or not isinstance(temp_path, str):
        return None
    try:
        base = _TEMP_AUDIO_DIR.resolve()
        src = Path(temp_path).resolve()
        src.relative_to(base)
    except (ValueError, OSError, TypeError):
        return None
    if src == base:
        return None
    if not src.exists() or not src.is_file():
        return None
    return src


def _remove_temp_audio_entry(src: Path) -> None:
    try:
        base = _TEMP_AUDIO_DIR.resolve()
        src.relative_to(base)
    except (ValueError, OSError):
        return
    try:
        if src.exists() and src.is_file():
            src.unlink(missing_ok=True)
    except Exception:
        pass
    try:
        parent = src.parent.resolve()
        parent.relative_to(base)
        if parent != base and parent.exists() and parent.is_dir():
            shutil.rmtree(parent, ignore_errors=True)
    except Exception:
        pass

# ── Binarios yt-dlp / ffmpeg ─────────────────────────────────────────────────

_USER_BIN_DIR = Path.home() / '.mhl-music' / 'bin'

def _assets_dir() -> Path:
    """Funciona tanto en desarrollo como dentro del .exe de PyInstaller."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'assets'   # type: ignore[attr-defined]
    return Path(__file__).parent / 'assets'

_ASSETS = _assets_dir()


def _bin(name: str) -> str:
    user_bin = _USER_BIN_DIR / name
    if user_bin.exists():
        return str(user_bin)
    p = _ASSETS / name
    return str(p) if p.exists() else name


_ytdlp_lock = threading.RLock()
_last_auto_update_time = 0.0
_AUTO_UPDATE_COOLDOWN = 12 * 3600.0  # 12 horas de cooldown para auto-update reactivo

_YTDLP_OUTDATED_PATTERNS = re.compile(
    r"(Sign in to confirm you're not a bot|HTTP Error 403: Forbidden|Unable to extract|n-sig extraction failed|player response|Signature extraction failed|ERROR:.*extractor.*|YouTube said:.*confirm you're not a bot|Video unavailable)",
    re.IGNORECASE
)


def _is_outdated_ytdlp_error(err_text: str) -> bool:
    if not err_text:
        return False
    return bool(_YTDLP_OUTDATED_PATTERNS.search(err_text))


def _encode_audio_bytes(value: bytes) -> str:
    return base64.b64encode(value).decode('ascii')


def _metadata_text(data: dict, *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        values = value if isinstance(value, list) else [value]
        texts = []
        for entry in values:
            if isinstance(entry, str) and entry.strip():
                texts.append(entry.strip())
            if isinstance(entry, dict):
                text = entry.get('name') or entry.get('title')
                if isinstance(text, str) and text.strip():
                    texts.append(text.strip())
        if texts:
            return ', '.join(dict.fromkeys(texts))
    return ''


# ── Anime client (AniList + Jikan/MAL + animethemes.moe) ─────────────────────
# Implementación síncrona con `requests`, que ya forma parte del runtime Desktop.

_ANILIST_ENDPOINT = 'https://graphql.anilist.co'
_ANISONGDB_ENDPOINT = 'https://anisongdb.com/api/search_request'
_MAL_BASE_URL = 'https://myanimelist.net/anime'
_JIKAN_ENDPOINT = 'https://api.jikan.moe/v4'
_ANIMETHEMES_ENDPOINT = 'https://api.animethemes.moe'
_ANIME_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': f'MHLMusic/{APP_VERSION}',
}
_ANIME_TIMEOUT = 10
_ANIME_MAX_SEASONS = 8
_ANIME_MAX_EXPLORED_NODES = 12
_ANIME_TRAVERSABLE_FORMATS = {'TV', 'MOVIE', 'OVA', 'ONA', 'TV_SHORT'}
_ANIME_FORMAT_PRIORITY = {
    'TV': 0,
    'ONA': 1,
    'MOVIE': 2,
    'OVA': 3,
    'TV_SHORT': 4,
}
_ANIME_RICH_META_KEYS = (
    'idMal', 'format', 'relations', 'episodes', 'startDate', 'coverImage',
)

_ANILIST_SEARCH_QUERY = """
query ($search: String!, $perPage: Int!) {
  Page(perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      coverImage { extraLarge large color }
      format
      episodes
      startDate { year }
      description
    }
  }
}
"""

_ANILIST_BY_ID_QUERY = """
query ($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji english native }
    format
    episodes
    startDate { year }
    coverImage { extraLarge large }
    relations {
      edges {
        relationType
        node {
          id
          idMal
          title { romaji english native }
          format
          episodes
          startDate { year }
          coverImage { extraLarge large }
        }
      }
    }
  }
}
"""

_HTML_TAG_RE = re.compile(r'<[^>]+>')
_JP_PAREN_RE = re.compile(
    r'\s*\((?!\s*(?:feat|ft)(?:\.|\s))[^)]*[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef][^)]*\)',
    re.IGNORECASE,
)
_JIKAN_SEQ_RE = re.compile(r'^(\d+)\s*:\s*')
_JIKAN_TRAILING_BRACKET_RE = re.compile(r'(?:\s*\[[^\]]*\])+\s*$')
_JIKAN_EPS_RE = re.compile(
    r'\s*\((?:eps?\.?|episodes?)\s*([^)]+)\)(?=\s*(?:\[[^\]]*\]|\([^)]*\))*\s*$)',
    re.IGNORECASE,
)
_JIKAN_QUOTED_RE = re.compile(r'^["“](.+?)["”]\s*(?:by\s+(.+))?$', re.IGNORECASE)


def _strip_html(text):
    if not text:
        return None
    cleaned = _HTML_TAG_RE.sub('', str(text))
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned or None


def _anime_cover(cover):
    if not isinstance(cover, dict):
        return ''
    return (
        cover.get('extraLarge')
        or cover.get('large')
        or cover.get('medium')
        or cover.get('color')
        or ''
    )


def _anime_titles(title):
    title = title or {}
    romaji = (title.get('romaji') or title.get('english') or title.get('native') or '').strip()
    english = title.get('english') or None
    native = title.get('native') or None
    return romaji, english, native


def _anime_episode_range(entries):
    if not entries:
        return None, None
    if isinstance(entries, str):
        numbers = [int(value) for value in re.findall(r'\d+', entries)]
        if not numbers:
            return None, None
        return min(numbers), max(numbers)
    numbers = []
    for ep in entries:
        if not isinstance(ep, dict):
            continue
        name = ep.get('name')
        if not name:
            continue
        match = re.search(r'\d+', str(name))
        if match:
            try:
                numbers.append(int(match.group(0)))
            except (TypeError, ValueError):
                continue
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def _anime_graphql_post(url, query, variables):
    """POST síncrono con timeout duro. Devuelve el dict 'data' o lanza excepción."""
    payload = {'query': query, 'variables': variables}
    response = _http_post(url, json=payload, headers=_ANIME_HEADERS, timeout=_ANIME_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError(f'Respuesta inválida de {url}: no es un objeto JSON')
    if data.get('errors'):
        first = data['errors'][0]
        msg = first.get('message') if isinstance(first, dict) else str(first)
        raise RuntimeError(f'GraphQL error: {msg}')
    return data.get('data') or {}


def _anime_search(query, limit=10):
    if not query or not str(query).strip():
        raise ValueError('query must not be empty')
    per_page = max(1, min(int(limit), 25))
    data = _anime_graphql_post(
        _ANILIST_ENDPOINT, _ANILIST_SEARCH_QUERY, {'search': query, 'perPage': per_page}
    )
    media = ((data.get('Page') or {}).get('media')) or []
    results = []
    for item in media:
        if not isinstance(item, dict):
            continue
        romaji, english, native = _anime_titles(item.get('title'))
        if not romaji:
            continue
        start_date = item.get('startDate') or {}
        year_raw = start_date.get('year')
        year = int(year_raw) if isinstance(year_raw, int) else None
        episodes_raw = item.get('episodes')
        episodes = int(episodes_raw) if isinstance(episodes_raw, int) else None
        results.append({
            'id': int(item.get('id') or 0),
            'titleRomaji': romaji,
            'titleEnglish': english,
            'titleNative': native,
            'cover': _anime_cover(item.get('coverImage')),
            'type': str(item.get('format') or item.get('type') or 'SPECIAL'),
            'episodes': episodes,
            'year': year,
            'synopsis': _strip_html(item.get('description')),
        })
    return results


def _anime_fetch_meta(anilist_id):
    data = _anime_graphql_post(
        _ANILIST_ENDPOINT, _ANILIST_BY_ID_QUERY, {'id': anilist_id}
    )
    return data.get('Media') or None


def _is_rich_anilist_meta(meta) -> bool:
    return isinstance(meta, dict) and any(key in meta for key in _ANIME_RICH_META_KEYS)


def _iter_traversable_edges(meta: dict) -> list[tuple[str, int, dict]]:
    relations = meta.get('relations')
    if not isinstance(relations, dict):
        return []
    edges = relations.get('edges')
    if not isinstance(edges, list):
        return []
    candidates: list[tuple[int, int, str, int, dict]] = []
    for idx, edge in enumerate(edges):
        if not isinstance(edge, dict):
            continue
        rel_type = str(edge.get('relationType') or '').upper()
        if rel_type not in {'PREQUEL', 'SEQUEL'}:
            continue
        node = edge.get('node')
        if not isinstance(node, dict):
            continue
        node_id = node.get('id')
        if isinstance(node_id, bool) or not isinstance(node_id, int) or node_id <= 0:
            continue
        fmt = str(node.get('format') or '').upper()
        if fmt not in _ANIME_TRAVERSABLE_FORMATS:
            continue
        priority = _ANIME_FORMAT_PRIORITY.get(fmt, 99)
        candidates.append((priority, idx, rel_type, node_id, node))
    candidates.sort(key=lambda item: (item[0], item[1]))
    return [(rel_type, node_id, node) for _prio, _idx, rel_type, node_id, node in candidates]


def _is_season_node(node: dict, is_root: bool, root_format: str) -> bool:
    fmt = str(node.get('format') or '').upper()
    if fmt == 'TV':
        return True
    if fmt == 'ONA':
        if is_root or root_format == 'ONA':
            return True
        eps = node.get('episodes')
        if isinstance(eps, int) and not isinstance(eps, bool) and eps > 1:
            return True
    return False


def _node_start_year(node: dict) -> int | None:
    start_date = node.get('startDate')
    if not isinstance(start_date, dict):
        return None
    year_raw = start_date.get('year')
    if isinstance(year_raw, int) and not isinstance(year_raw, bool):
        return int(year_raw)
    return None


def _build_anime_season_dict(node: dict, season_number: int, fallback_id: int = 0) -> dict:
    node_id_raw = node.get('id')
    node_id = (
        int(node_id_raw)
        if isinstance(node_id_raw, int) and not isinstance(node_id_raw, bool) and node_id_raw > 0
        else int(fallback_id)
    )
    mal_raw = node.get('idMal')
    mal_id = (
        int(mal_raw)
        if isinstance(mal_raw, int) and not isinstance(mal_raw, bool) and mal_raw > 0
        else None
    )
    romaji, english, _native = _anime_titles(node.get('title'))
    year = _node_start_year(node)
    episodes_raw = node.get('episodes')
    episodes = (
        int(episodes_raw)
        if isinstance(episodes_raw, int) and not isinstance(episodes_raw, bool)
        else None
    )
    return {
        'anilistId': node_id,
        'malId': mal_id,
        'seasonNumber': season_number,
        'titleRomaji': romaji,
        'titleEnglish': english,
        'year': year,
        'episodes': episodes,
        'cover': _anime_cover(node.get('coverImage')),
        'themes': [],
    }


def _anime_collect_seasons(anilist_id: int) -> list[dict]:
    root_meta = _anime_fetch_meta(anilist_id)
    if root_meta is None:
        return []
    return _anime_collect_seasons_from_meta(root_meta, anilist_id)


def _anime_collect_seasons_from_meta(root_meta: dict, anilist_id: int) -> list[dict]:
    root_id_raw = root_meta.get('id')
    root_id = (
        int(root_id_raw)
        if isinstance(root_id_raw, int) and not isinstance(root_id_raw, bool) and root_id_raw > 0
        else int(anilist_id)
    )
    relations = root_meta.get('relations')
    if not isinstance(relations, dict):
        return [_build_anime_season_dict(root_meta, 1, fallback_id=root_id)]

    root_edges = _iter_traversable_edges(root_meta)
    if not root_edges:
        return [_build_anime_season_dict(root_meta, 1, fallback_id=root_id)]

    root_format = str(root_meta.get('format') or '').upper()
    visited: set[int] = {root_id}
    kept_entries: list[tuple[dict, int, int]] = []
    discovery_counter = 0

    if _is_season_node(root_meta, is_root=True, root_format=root_format):
        kept_entries.append((root_meta, 0, discovery_counter))

    queue: deque[tuple[dict, int]] = deque([(root_meta, 0)])
    while (
        queue
        and len(visited) < _ANIME_MAX_EXPLORED_NODES
        and len(kept_entries) < _ANIME_MAX_SEASONS
    ):
        curr_meta, curr_order = queue.popleft()
        edges_to_walk = root_edges if curr_meta is root_meta else _iter_traversable_edges(curr_meta)
        for rel_type, neighbor_id, neighbor_stub in edges_to_walk:
            if neighbor_id in visited:
                continue
            if len(visited) >= _ANIME_MAX_EXPLORED_NODES or len(kept_entries) >= _ANIME_MAX_SEASONS:
                break
            visited.add(neighbor_id)
            discovery_counter += 1
            next_order = curr_order - 1 if rel_type == 'PREQUEL' else curr_order + 1
            try:
                fetched = _anime_fetch_meta(neighbor_id)
            except Exception:
                fetched = None
            resolved_node = fetched if isinstance(fetched, dict) else neighbor_stub
            if _is_season_node(resolved_node, is_root=False, root_format=root_format):
                kept_entries.append((resolved_node, next_order, discovery_counter))
            if isinstance(fetched, dict):
                queue.append((fetched, next_order))

    if not kept_entries:
        return [_build_anime_season_dict(root_meta, 1, fallback_id=root_id)]

    all_have_year = all(_node_start_year(node) is not None for node, _ord, _disc in kept_entries)
    if all_have_year:
        kept_entries.sort(key=lambda item: (_node_start_year(item[0]) or 0, item[1], item[2]))
    else:
        kept_entries.sort(
            key=lambda item: (
                item[1],
                _node_start_year(item[0]) if _node_start_year(item[0]) is not None else 999999,
                item[2],
            )
        )

    ordered_nodes = [node for node, _ord, _disc in kept_entries[:_ANIME_MAX_SEASONS]]
    return [
        _build_anime_season_dict(node, idx, fallback_id=root_id if node is root_meta else 0)
        for idx, node in enumerate(ordered_nodes, start=1)
    ]


def _clean_jikan_label(value: str) -> str:
    raw = value.strip()
    if not raw:
        return ''
    cleaned = _JP_PAREN_RE.sub('', raw).strip()
    return cleaned or raw


def _parse_jikan_theme_entry(raw: str, theme_type: str, default_seq: int) -> dict | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    norm_type = 'OP' if str(theme_type or '').upper().startswith('OP') else 'ED'

    sequence = int(default_seq) if isinstance(default_seq, int) and default_seq > 0 else 1
    seq_match = _JIKAN_SEQ_RE.match(text)
    if seq_match:
        try:
            sequence = int(seq_match.group(1))
        except (TypeError, ValueError):
            pass
        text = text[seq_match.end():].strip()

    # Elimina sufijos finales tipo [Broadcast], [TV], [BD] antes de parsear episodios
    text = _JIKAN_TRAILING_BRACKET_RE.sub('', text).strip()

    episodes_from: int | None = None
    episodes_to: int | None = None
    eps_match = _JIKAN_EPS_RE.search(text)
    if eps_match:
        ep_spec = eps_match.group(1).strip()
        text = (text[:eps_match.start()] + ' ' + text[eps_match.end():]).strip()
        text = _JIKAN_TRAILING_BRACKET_RE.sub('', text).strip()
        raw_nums = re.findall(r'\d+(?:\.\d+)?', ep_spec)
        nums = [int(float(n)) for n in raw_nums]
        if nums:
            episodes_from = min(nums)
            if re.search(r'\d+\s*-\s*$', ep_spec):
                episodes_to = None
            else:
                episodes_to = max(nums)

    raw_title = ''
    raw_artist = ''
    quoted_match = _JIKAN_QUOTED_RE.match(text)
    if quoted_match:
        raw_title = (quoted_match.group(1) or '').strip()
        raw_artist = (quoted_match.group(2) or '').strip()
    else:
        parts = re.split(r'\s+by\s+', text, maxsplit=1, flags=re.IGNORECASE)
        raw_title = (parts[0] or '').strip().strip('"“”')
        raw_artist = (parts[1] or '').strip() if len(parts) > 1 else ''

    # Limpia posibles anotaciones residuales de episodios o corchetes en el artista
    if raw_artist:
        raw_artist = _JIKAN_TRAILING_BRACKET_RE.sub('', raw_artist).strip()
        trailing_eps = _JIKAN_EPS_RE.search(raw_artist)
        if trailing_eps:
            raw_artist = (
                raw_artist[:trailing_eps.start()] + ' ' + raw_artist[trailing_eps.end():]
            ).strip()
            raw_artist = _JIKAN_TRAILING_BRACKET_RE.sub('', raw_artist).strip()

    title = _clean_jikan_label(raw_title) or f'{norm_type} {sequence}'
    artist = _clean_jikan_label(raw_artist)
    return {
        'type': norm_type,
        'sequence': sequence,
        'title': title,
        'artist': artist,
        'episodesFrom': episodes_from,
        'episodesTo': episodes_to,
    }


def _anime_fetch_themes_jikan(mal_id: int, anilist_id: int) -> list[dict]:
    if isinstance(mal_id, bool) or not isinstance(mal_id, int) or mal_id <= 0:
        return []
    jikan_url = f'{_JIKAN_ENDPOINT}/anime/{mal_id}/themes'
    jikan_headers = {
        'User-Agent': _ANIME_HEADERS['User-Agent'],
        'Accept': 'application/json',
    }
    try:
        response = _http_get(
            jikan_url,
            headers=jikan_headers,
            timeout=_ANIME_TIMEOUT,
        )
        if getattr(response, 'status_code', None) == 429:
            retry_delay = 0.5
            headers = getattr(response, 'headers', None)
            raw_ra = headers.get('Retry-After') if headers is not None and hasattr(headers, 'get') else None
            if raw_ra is not None:
                try:
                    parsed_ra = float(raw_ra)
                    if parsed_ra >= 0:
                        retry_delay = min(parsed_ra, 1.5)
                except (TypeError, ValueError):
                    retry_delay = 0.5
            time.sleep(retry_delay)
            response = _http_get(
                jikan_url,
                headers=jikan_headers,
                timeout=_ANIME_TIMEOUT,
            )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    data = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return []

    themes: list[dict] = []
    for theme_type, key in (('OP', 'openings'), ('ED', 'endings')):
        raw_items = data.get(key)
        if not isinstance(raw_items, list):
            continue
        for idx, raw_entry in enumerate(raw_items, start=1):
            parsed = _parse_jikan_theme_entry(raw_entry, theme_type, idx)
            if parsed is None:
                continue
            themes.append({
                'animeId': anilist_id,
                'type': parsed['type'],
                'sequence': parsed['sequence'],
                'title': parsed['title'],
                'artist': parsed['artist'],
                'episodesFrom': parsed['episodesFrom'],
                'episodesTo': parsed['episodesTo'],
                'audioUrl': None,
                'videoUrl': None,
            })
    return themes


def _anime_fetch_themes_by_anilist_id(anilist_id: int) -> list[dict]:
    if isinstance(anilist_id, bool) or not isinstance(anilist_id, int) or anilist_id <= 0:
        return []
    try:
        response = _http_get(
            f'{_ANIMETHEMES_ENDPOINT}/anime',
            params={
                'filter[has]': 'resources',
                'filter[site]': 'AniList',
                'filter[external_id]': str(anilist_id),
                'include': (
                    'animethemes.song.artists,'
                    'animethemes.animethemeentries.videos.audio'
                ),
            },
            headers=_ANIME_HEADERS,
            timeout=_ANIME_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    anime_list = payload.get('anime') if isinstance(payload, dict) else None
    if not isinstance(anime_list, list):
        return []
    for anime_node in anime_list:
        if not isinstance(anime_node, dict):
            continue
        raw_themes = anime_node.get('animethemes')
        if isinstance(raw_themes, list) and raw_themes:
            shaped = _anime_shape_themes(
                [t for t in raw_themes if isinstance(t, dict)],
                anilist_id,
            )
            if shaped:
                return shaped
    return []


def _anime_search_animethemes(name):
    response = _http_get(
        f'{_ANIMETHEMES_ENDPOINT}/anime',
        params={'filter[name]': name, 'page[size]': 15},
        headers=_ANIME_HEADERS,
        timeout=_ANIME_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    results = payload.get('anime') if isinstance(payload, dict) else []
    if not results:
        return None
    normalized_name = re.sub(r'\W+', '', name).casefold()
    if not normalized_name:
        return None
    for result in results:
        if not isinstance(result, dict):
            continue
        candidate = re.sub(r'\W+', '', str(result.get('name') or '')).casefold()
        if candidate == normalized_name:
            return result
    if len(normalized_name) >= 4:
        best = None
        best_diff = None
        for result in results:
            if not isinstance(result, dict):
                continue
            candidate = re.sub(r'\W+', '', str(result.get('name') or '')).casefold()
            if not candidate or len(candidate) < 4:
                continue
            if (
                candidate.startswith(normalized_name)
                or normalized_name.startswith(candidate)
                or normalized_name in candidate
                or candidate in normalized_name
            ):
                diff = abs(len(candidate) - len(normalized_name))
                if best_diff is None or diff < best_diff:
                    best = result
                    best_diff = diff
        if best is not None:
            return best
    return None


def _anime_fetch_themes(anime_slug):
    response = _http_get(
        f'{_ANIMETHEMES_ENDPOINT}/anime/{anime_slug}',
        params={
            'include': (
                'animethemes.song.artists,'
                'animethemes.animethemeentries.videos.audio'
            )
        },
        headers=_ANIME_HEADERS,
        timeout=_ANIME_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    anime = payload.get('anime') if isinstance(payload, dict) else {}
    themes = anime.get('animethemes') if isinstance(anime, dict) else []
    return [t for t in themes if isinstance(t, dict)]


def _anime_shape_themes(raw_themes, anilist_id):
    shaped = []
    for theme in raw_themes:
        theme_type = str(theme.get('type') or '').upper()
        if theme_type not in {'OP', 'ED'}:
            continue
        try:
            sequence = int(theme.get('sequence') or 0)
        except (TypeError, ValueError):
            sequence = 0
        song = theme.get('song') or {}
        title = str(song.get('title') or f'{theme_type} {sequence}')
        artists = song.get('artists') or []
        artist = ', '.join(
            str(item.get('name')).strip()
            for item in artists
            if isinstance(item, dict) and item.get('name')
        )
        entries = theme.get('animethemeentries') or []
        theme_added = False
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            videos = entry.get('videos') or []
            ordered_videos = sorted(
                videos,
                key=lambda item: not (
                    isinstance(item, dict)
                    and isinstance(item.get('audio'), dict)
                    and item['audio'].get('link')
                ),
            )
            for video in ordered_videos:
                if not isinstance(video, dict):
                    continue
                audio = video.get('audio') or {}
                audio_url = audio.get('link') if isinstance(audio, dict) else None
                video_url = video.get('link')
                eps_from, eps_to = _anime_episode_range(entry.get('episodes'))
                shaped.append({
                    'animeId': anilist_id,
                    'type': theme_type,
                    'sequence': sequence,
                    'title': title,
                    'artist': artist,
                    'episodesFrom': eps_from,
                    'episodesTo': eps_to,
                    'audioUrl': audio_url,
                    'videoUrl': video_url,
                })
                theme_added = True
                break
            if theme_added:
                break
        if not theme_added:
            shaped.append({
                'animeId': anilist_id,
                'type': theme_type,
                'sequence': sequence,
                'title': title,
                'artist': artist,
                'episodesFrom': None,
                'episodesTo': None,
                'audioUrl': None,
                'videoUrl': None,
            })
    return shaped


def _anime_fetch_themes_by_name(romaji: str, english: str | None, anilist_id: int) -> list[dict]:
    candidate_names: list[str] = []
    for name in (english, romaji):
        if isinstance(name, str) and name.strip() and name.strip() not in candidate_names:
            candidate_names.append(name.strip())
    for search_name in candidate_names:
        anime_node = _anime_search_animethemes(search_name)
        if anime_node is None:
            continue
        anime_slug = anime_node.get('slug')
        if not isinstance(anime_slug, str) or not anime_slug:
            continue
        raw_themes = _anime_fetch_themes(anime_slug)
        shaped = _anime_shape_themes(raw_themes, anilist_id)
        if shaped:
            return shaped
    return []


_ANISONGDB_SONG_TYPE_RE = re.compile(r'^(Opening|Ending)\s*(\d+)?', re.IGNORECASE)
_MAL_STREAMING_NOISE_RE = re.compile(
    r'^(?:Spotify|Apple Music|Amazon Music|Youtube Music|YouTube)(?:\s+(?:Spotify|Apple Music|Amazon Music|Youtube Music|YouTube))*$',
    re.IGNORECASE,
)


def _anime_fetch_themes_anisongdb(
    anilist_id: int,
    mal_id: int | None,
    romaji: str,
    english: str | None,
) -> list[dict]:
    candidate_names: list[str] = []
    for name in (romaji, english):
        if isinstance(name, str) and name.strip() and name.strip() not in candidate_names:
            candidate_names.append(name.strip())
    if not candidate_names:
        return []

    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': _ANIME_HEADERS['User-Agent'],
    }
    for search_name in candidate_names:
        try:
            response = _http_post(
                _ANISONGDB_ENDPOINT,
                json={
                    'anime_search_filter': {
                        'search': search_name,
                        'partial_match': True,
                        'max_other_artist': 99,
                        'group_by_site': False,
                        'and_logic': False,
                    },
                    'and_logic': False,
                    'ignore_duplicate': False,
                    'opening_filter': True,
                    'ending_filter': True,
                    'insert_filter': False,
                },
                headers=headers,
                timeout=_ANIME_TIMEOUT,
            )
            if not getattr(response, 'ok', False):
                continue
            items = response.json()
            if not isinstance(items, list):
                continue
        except Exception:
            continue

        seen: set[tuple[str, int, str]] = set()
        themes: list[dict] = []
        for entry in items:
            if not isinstance(entry, dict) or entry.get('isDub') is True:
                continue
            linked = entry.get('linked_ids')
            if not isinstance(linked, dict):
                continue
            linked_al = linked.get('anilist')
            linked_mal = linked.get('myanimelist')
            if linked_al != anilist_id and not (mal_id and linked_mal == mal_id):
                continue

            raw_type = str(entry.get('songType') or '').strip()
            type_match = _ANISONGDB_SONG_TYPE_RE.match(raw_type)
            if not type_match:
                continue
            norm_type = 'OP' if type_match.group(1).lower().startswith('open') else 'ED'
            seq = int(type_match.group(2)) if type_match.group(2) else 1
            title = _clean_jikan_label(str(entry.get('songName') or '')) or f'{norm_type} {seq}'
            artist = _clean_jikan_label(str(entry.get('songArtist') or ''))
            dedupe_key = (norm_type, seq, title.lower())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            themes.append({
                'animeId': anilist_id,
                'type': norm_type,
                'sequence': seq,
                'title': title,
                'artist': artist,
                'episodesFrom': None,
                'episodesTo': None,
                'audioUrl': None,
                'videoUrl': None,
            })

        if themes:
            themes.sort(key=lambda t: (0 if t['type'] == 'OP' else 1, t['sequence'], t['title'].lower()))
            return themes
    return []


def _anime_fetch_themes_mal_html(mal_id: int, anilist_id: int) -> list[dict]:
    if isinstance(mal_id, bool) or not isinstance(mal_id, int) or mal_id <= 0:
        return []
    try:
        response = _http_get(
            f'{_MAL_BASE_URL}/{mal_id}',
            headers={
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                ),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout=_ANIME_TIMEOUT,
        )
        if not getattr(response, 'ok', False):
            return []
        page_html = getattr(response, 'text', '') or ''
    except Exception:
        return []

    if not page_html:
        return []

    themes: list[dict] = []
    for norm_type, cls_name in (('OP', 'opnening'), ('ED', 'ending')):
        block_match = re.search(
            rf'class="theme-songs js-theme-songs {cls_name}"[\s\S]*?</table>',
            page_html,
            re.IGNORECASE,
        )
        if not block_match:
            continue
        rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', block_match.group(0), re.IGNORECASE)
        seq_counter = 0
        for row_html in rows:
            text = html_lib.unescape(_HTML_TAG_RE.sub(' ', row_html))
            text = re.sub(r'\s+', ' ', text).strip()
            if not text or _MAL_STREAMING_NOISE_RE.match(text):
                continue
            seq_counter += 1
            parsed = _parse_jikan_theme_entry(text, norm_type, seq_counter)
            if parsed is None or _MAL_STREAMING_NOISE_RE.match(parsed['title']):
                continue
            themes.append({
                'animeId': anilist_id,
                'type': parsed['type'],
                'sequence': parsed['sequence'],
                'title': parsed['title'],
                'artist': parsed['artist'],
                'episodesFrom': parsed['episodesFrom'],
                'episodesTo': parsed['episodesTo'],
                'audioUrl': None,
                'videoUrl': None,
            })
    return themes


def _resolve_season_themes(season: dict, include_season_fields: bool) -> list[dict]:
    sid = season['anilistId']
    mal_id = season['malId']
    romaji = season.get('titleRomaji') or ''
    english = season.get('titleEnglish')
    themes: list[dict] = []

    themes = _anime_fetch_themes_anisongdb(sid, mal_id, romaji, english)

    if not themes and mal_id:
        themes = _anime_fetch_themes_mal_html(mal_id, sid)

    if not themes and mal_id:
        themes = _anime_fetch_themes_jikan(mal_id, sid)

    if not themes:
        themes = _anime_fetch_themes_by_anilist_id(sid)

    if not themes:
        themes = _anime_fetch_themes_by_name(romaji, english, sid)

    if include_season_fields:
        season_title = season.get('titleEnglish') or season.get('titleRomaji') or ''
        for theme in themes:
            theme['seasonNumber'] = season['seasonNumber']
            theme['seasonTitle'] = season_title
            theme['malId'] = mal_id

    return themes


def _anime_get_themes_with_seasons(anilist_id: int) -> tuple[list[dict], list[dict], bool]:
    if isinstance(anilist_id, bool) or not isinstance(anilist_id, int) or anilist_id <= 0:
        raise ValueError('anilist_id must be a positive integer')

    root_meta = _anime_fetch_meta(anilist_id)
    if root_meta is None:
        return [], [], False

    is_rich = _is_rich_anilist_meta(root_meta)
    seasons = _anime_collect_seasons_from_meta(root_meta, anilist_id)
    if not seasons:
        return [], [], is_rich

    def _safe_resolve(season_item: dict, include_season_fields: bool) -> list[dict]:
        try:
            return _resolve_season_themes(season_item, include_season_fields=include_season_fields)
        except Exception:
            return []

    if len(seasons) == 1:
        seasons[0]['themes'] = _safe_resolve(seasons[0], include_season_fields=is_rich)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            resolved_lists = list(
                executor.map(lambda item: _safe_resolve(item, include_season_fields=True), seasons)
            )
        for season_item, season_themes in zip(seasons, resolved_lists):
            season_item['themes'] = season_themes

    flat_themes: list[dict] = []
    for season_item in seasons:
        flat_themes.extend(season_item['themes'])
    return flat_themes, seasons, is_rich


def _anime_get_themes(anilist_id):
    flat_themes, _seasons, _is_rich = _anime_get_themes_with_seasons(anilist_id)
    return flat_themes



# ── Bridge ────────────────────────────────────────────────────────────────────

class Bridge:
    """
    Métodos públicos → accesibles desde JS como window.pywebview.api.<método>().
    Todos devuelven valores JSON-serializables (dict / list / str / int / bool / None).
    """

    def __init__(self):
        self._window = None  # asignado por launcher después de create_window
        self._dl_lock = threading.Lock()
        _cleanup_stale_temp_audio_dirs()

    # ── Motor yt-dlp: versión, actualización y auto-healing ─────────────────

    def ytdlp_get_version(self) -> dict:
        """Devuelve la versión actual del ejecutable yt-dlp."""
        try:
            target = _bin('yt-dlp.exe')
            proc = subprocess.run(
                [target, '--version'],
                capture_output=True, text=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=10, encoding='utf-8', errors='replace',
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return {'success': True, 'version': proc.stdout.strip()}
            return {'success': False, 'version': 'unknown', 'error': (proc.stderr or 'Error verificando version').strip()}
        except Exception as exc:
            return {'success': False, 'version': 'unknown', 'error': str(exc)}

    def ytdlp_update(self, force: bool = False) -> dict:
        """
        Actualiza yt-dlp.exe ejecutando -U de manera atómica con Mutex.
        Garantiza que el binario viva en el directorio de usuario si el bundle es read-only.
        """
        with _ytdlp_lock:
            try:
                _USER_BIN_DIR.mkdir(parents=True, exist_ok=True)
                user_bin = _USER_BIN_DIR / 'yt-dlp.exe'
                bundled_bin = _ASSETS / 'yt-dlp.exe'

                # Si no existe en el directorio de usuario, copiar el binario base para que sea mutable
                if not user_bin.exists() and bundled_bin.exists():
                    try:
                        shutil.copy2(bundled_bin, user_bin)
                    except Exception:
                        pass

                target = str(user_bin) if user_bin.exists() else _bin('yt-dlp.exe')

                proc = subprocess.run(
                    [target, '-U'],
                    capture_output=True, text=True,
                    creationflags=CREATE_NO_WINDOW,
                    timeout=90, encoding='utf-8', errors='replace',
                )
                output = (proc.stdout + '\n' + proc.stderr).strip()

                # Limpiar cualquier residuo .old en Windows
                old_file = Path(target).with_suffix('.exe.old')
                if old_file.exists():
                    try:
                        old_file.unlink()
                    except Exception:
                        pass

                ver_proc = subprocess.run(
                    [target, '--version'],
                    capture_output=True, text=True,
                    creationflags=CREATE_NO_WINDOW,
                    timeout=10, encoding='utf-8', errors='replace',
                )
                ver = ver_proc.stdout.strip() if ver_proc.returncode == 0 else 'unknown'

                status = 'DONE'
                if 'is up to date' in output or 'up-to-date' in output.lower():
                    status = 'ALREADY_LATEST'
                elif proc.returncode != 0:
                    status = 'FAILED'

                return {
                    'success': proc.returncode == 0,
                    'status': status,
                    'version': ver,
                    'output': output,
                }
            except Exception as exc:
                return {'success': False, 'status': 'FAILED', 'error': str(exc)}

    def _try_reactive_ytdlp_update(self) -> bool:
        """
        Auto-update reactivo cuando una llamada falla con error de extractor/cifrado/403.
        Respeta circuit breaker con cooldown de 12 horas.
        """
        global _last_auto_update_time
        with _ytdlp_lock:
            now = time.time()
            if (now - _last_auto_update_time) < _AUTO_UPDATE_COOLDOWN:
                return False
            _last_auto_update_time = now
        res = self.ytdlp_update()
        return bool(res.get('success') and res.get('status') == 'DONE')

    # ── Deezer (llamadas directas a api.deezer.com desde Python, sin CORS) ───

    def deezer_search(self, query: str, limit: int = 25, offset: int = 0) -> dict:
        try:
            r = _http_get(
                'https://api.deezer.com/search',
                params={'q': query, 'limit': limit, 'index': offset},
                timeout=10,
            )
            return r.json()
        except Exception as e:
            return {'data': [], 'total': 0, 'error': str(e)}

    def deezer_track(self, track_id: str) -> dict:
        if isinstance(track_id, bool) or not isinstance(track_id, (str, int)):
            return {'error': 'Invalid track_id'}
        tid = str(track_id).strip()
        if not re.fullmatch(r'^\d+$', tid, re.ASCII):
            return {'error': 'Invalid track_id'}
        try:
            r = _http_get(f'https://api.deezer.com/track/{tid}', timeout=10, allow_redirects=False)
            r.raise_for_status()
            status_code = getattr(r, 'status_code', 200)
            if isinstance(status_code, int) and status_code >= 300:
                return {'error': f'Deezer HTTP {status_code}'}
            return r.json()
        except Exception as e:
            return {'error': str(e)}

    def deezer_album(self, album_id: str) -> dict:
        if isinstance(album_id, bool) or not isinstance(album_id, (str, int)):
            return {'error': 'Invalid album_id'}
        aid = str(album_id).strip()
        if not re.fullmatch(r'^\d+$', aid, re.ASCII):
            return {'error': 'Invalid album_id'}
        try:
            r = _http_get(f'https://api.deezer.com/album/{aid}', timeout=10, allow_redirects=False)
            r.raise_for_status()
            status_code = getattr(r, 'status_code', 200)
            if isinstance(status_code, int) and status_code >= 300:
                return {'error': f'Deezer HTTP {status_code}'}
            return r.json()
        except Exception as e:
            return {'error': str(e)}

    def deezer_playlist(self, playlist_id: str) -> dict:
        if isinstance(playlist_id, bool) or not isinstance(playlist_id, (str, int)):
            return {'error': 'Invalid playlist_id'}
        pid = str(playlist_id).strip()
        if not re.fullmatch(r'^\d+$', pid, re.ASCII):
            return {'error': 'Invalid playlist_id'}
        try:
            r = _http_get(f'https://api.deezer.com/playlist/{pid}', timeout=10, allow_redirects=False)
            r.raise_for_status()
            status_code = getattr(r, 'status_code', 200)
            if isinstance(status_code, int) and status_code >= 300:
                return {'error': f'Deezer HTTP {status_code}'}
            return r.json()
        except Exception as e:
            return {'error': str(e)}

    # ── Anime (AniList + animethemes.moe, llamadas directas desde Python) ────

    def anime_search(self, query: str, limit: int = 10) -> dict:
        """
        Busca anime en AniList via GraphQL.
        Devuelve {"success": True, "results": [...]} o {"success": False, "error": str}.
        """
        try:
            results = _anime_search(query=query, limit=limit)
            return {'success': True, 'results': results}
        except ValueError as e:
            # Input inválido (query vacía, etc.) — no es un error de red
            return {'success': False, 'error': str(e)}
        except Exception as e:
            return {'success': False, 'error': f'pywebview backend failed: {str(e)}'}

    def tag_and_save_m4a(
        self,
        file_path: str,
        audio_b64: str | None = None,
        title: str = '',
        artist: str = '',
        album: str = '',
        cover_url: str | None = None,
        lyrics: str | None = None,
        album_artist: str | None = None,
        composer: str | None = None,
        genre: str | None = None,
        year: str | int | None = None,
        track_number: int | str | None = None,
        track_total: int | str | None = None,
        disc_number: int | str | None = None,
        disc_total: int | str | None = None,
        temp_path: str | None = None,
    ) -> dict:
        """Escribe M4A/MP3 a disco e inyecta metadata via Mutagen."""
        src_temp: Path | None = None
        temp_path_work: Path | None = None
        try:
            if temp_path is not None:
                src_temp = _resolve_safe_temp_audio_path(temp_path)
                if src_temp is None:
                    return {'success': False, 'error': 'Invalid temp_path'}
            elif not audio_b64:
                return {'success': False, 'error': 'Missing audio data'}

            root = Path(settings.get(
                'download_folder',
                str(Path.home() / 'Music' / 'MHL Music'),
            )).resolve()
            target_path = Path(file_path).resolve()
            try:
                target_path.relative_to(root)
            except ValueError:
                safe_name = re.sub(r'[\<\>\:\"\/\\\|\?\*]', '_', Path(file_path).name)
                target_path = (root / safe_name).resolve()

            target_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path_work = target_path.with_suffix(f'{target_path.suffix}.{uuid.uuid4().hex[:8]}.tmp')
            if src_temp is not None:
                shutil.copy2(str(src_temp), str(temp_path_work))
            else:
                audio_bytes = base64.b64decode(audio_b64)
                temp_path_work.write_bytes(audio_bytes)

            if target_path.suffix.lower() == '.mp3':
                from mutagen.id3 import ID3, TIT2, TPE1, TALB, TPE2, TCOM, TCON, TYER, TRCK, TPOS, USLT, APIC, ID3NoHeaderError
                try:
                    audio = ID3(str(temp_path_work))
                except ID3NoHeaderError:
                    audio = ID3()
                if title: audio.add(TIT2(encoding=3, text=title))
                if artist: audio.add(TPE1(encoding=3, text=artist))
                if album: audio.add(TALB(encoding=3, text=album))
                if album_artist: audio.add(TPE2(encoding=3, text=album_artist))
                if composer: audio.add(TCOM(encoding=3, text=composer))
                if genre: audio.add(TCON(encoding=3, text=genre))
                if year: audio.add(TYER(encoding=3, text=str(year)))

                trkn_num = int(track_number) if track_number not in (None, '') else 0
                trkn_tot = int(track_total) if track_total not in (None, '') else 0
                if trkn_num > 0 or trkn_tot > 0:
                    audio.add(TRCK(encoding=3, text=f"{trkn_num}/{trkn_tot}" if trkn_tot else str(trkn_num)))

                disc_num = int(disc_number) if disc_number not in (None, '') else 0
                disc_tot = int(disc_total) if disc_total not in (None, '') else 0
                if disc_num > 0 or disc_tot > 0:
                    audio.add(TPOS(encoding=3, text=f"{disc_num}/{disc_tot}" if disc_tot else str(disc_num)))

                if lyrics: audio.add(USLT(encoding=3, lang='eng', desc='', text=lyrics))

                if cover_url:
                    cover_bytes = _fetch_cover_bytes(cover_url)
                    if cover_bytes:
                        mime = 'image/png' if cover_bytes.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg'
                        audio.add(APIC(encoding=3, mime=mime, type=3, desc='Cover', data=cover_bytes))

                audio.save(str(temp_path_work), v2_version=3)
            else:
                from mutagen.mp4 import MP4, MP4Cover

                audio = MP4(str(temp_path_work))
                if title: audio["\xa9nam"] = title
                if artist: audio["\xa9ART"] = artist
                if album: audio["\xa9alb"] = album
                if album_artist: audio["aART"] = album_artist
                if composer: audio["\xa9wrt"] = composer
                if genre: audio["\xa9gen"] = genre
                if year: audio["\xa9day"] = str(year)

                trkn_num = int(track_number) if track_number not in (None, '') else 0
                trkn_tot = int(track_total) if track_total not in (None, '') else 0
                if trkn_num > 0 or trkn_tot > 0:
                    audio["trkn"] = [(trkn_num, trkn_tot)]

                disc_num = int(disc_number) if disc_number not in (None, '') else 0
                disc_tot = int(disc_total) if disc_total not in (None, '') else 0
                if disc_num > 0 or disc_tot > 0:
                    audio["disk"] = [(disc_num, disc_tot)]

                if lyrics: audio["\xa9lyr"] = lyrics

                if cover_url:
                    cover_bytes = _fetch_cover_bytes(cover_url)
                    if cover_bytes:
                        img_fmt = (
                            getattr(MP4Cover, 'FORMAT_PNG', MP4Cover.FORMAT_JPEG)
                            if cover_bytes.startswith(b'\x89PNG\r\n\x1a\n')
                            else MP4Cover.FORMAT_JPEG
                        )
                        audio["covr"] = [MP4Cover(cover_bytes, imageformat=img_fmt)]

                audio.save()

            temp_path_work.replace(target_path)
            return {'success': True, 'size': target_path.stat().st_size}
        except Exception as e:
            if temp_path_work is not None:
                try:
                    if temp_path_work.exists():
                        temp_path_work.unlink()
                except Exception:
                    pass
            return {'success': False, 'error': f'tagging failed: {str(e)}'}
        finally:
            if src_temp is not None:
                _remove_temp_audio_entry(src_temp)

    def cleanup_temp_audio(self, temp_path: str) -> dict:
        """Elimina de forma segura un archivo temporal dentro de _TEMP_AUDIO_DIR."""
        if not temp_path or not isinstance(temp_path, str):
            return {'success': False, 'error': 'Invalid temp_path'}
        try:
            base = _TEMP_AUDIO_DIR.resolve()
            target = Path(temp_path).resolve()
            target.relative_to(base)
        except (ValueError, OSError, TypeError):
            return {'success': False, 'error': 'Invalid temp_path'}
        if target == base or (target.exists() and target.is_dir()):
            return {'success': False, 'error': 'Invalid temp_path'}

        _remove_temp_audio_entry(target)
        return {'success': True}

    def anime_get_themes(self, anilist_id: int) -> dict:
        """
        Devuelve la lista de OP/ED de un anime (anilist_id) por temporadas usando
        AniList + Jikan/MAL + animethemes.moe.
        Devuelve {"success": True, "themes": [...], "seasons": [...]} o {"success": False, "error": str}.
        """
        try:
            themes, seasons, is_rich = _anime_get_themes_with_seasons(anilist_id=anilist_id)
            if not is_rich and not themes:
                return {'success': True, 'themes': []}
            return {'success': True, 'themes': themes, 'seasons': seasons}
        except ValueError as e:
            return {'success': False, 'error': str(e)}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ── YouTube search ────────────────────────────────────────────────────────

    def get_candidates(self, track_info: dict) -> dict:
        """Extrae candidatos crudos. El ranking pertenece al resolver TypeScript."""
        title = str(track_info.get('title') or '').strip()
        artist = str(track_info.get('artist') or '').strip()
        source = track_info.get('source') or 'youtube_music'
        deep = track_info.get('depth') == 'deep'
        query = f'{artist} - {title}'.strip(' -')
        limit = 8 if deep else 3
        if not query:
            return {'success': False, 'error': 'Missing title and artist'}

        target = (
            f'https://music.youtube.com/search?q={quote_plus(query)}#songs'
            if source == 'youtube_music'
            else f'ytsearch{limit}:{query}'
        )
        args = [
            _bin('yt-dlp.exe'),
            target, '--dump-json', '--skip-download', '--playlist-end', str(limit),
            '--socket-timeout', '12', '--retries', '2', '--quiet', '--no-warnings',
        ]
        args.append('--flat-playlist')
        try:
            r = subprocess.run(
                args, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
                timeout=35 if deep else 20, encoding='utf-8', errors='replace',
            )
            if r.returncode != 0:
                err_text = (r.stderr or '').strip()
                if _is_outdated_ytdlp_error(err_text) and self._try_reactive_ytdlp_update():
                    args[0] = _bin('yt-dlp.exe')
                    r = subprocess.run(
                        args, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
                        timeout=35 if deep else 20, encoding='utf-8', errors='replace',
                    )
                if r.returncode != 0:
                    return {'success': False, 'error': (r.stderr or 'yt-dlp search failed').strip()}
            candidates = []
            for line in r.stdout.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    video_id = d.get('id') or d.get('url') or ''
                    if not video_id:
                        continue
                    candidate_artist = _metadata_text(
                        d, 'artist', 'artists', 'creator', 'creators',
                        'album_artist', 'album_artists',
                    )
                    candidate_channel = _metadata_text(d, 'channel', 'uploader') or candidate_artist
                    candidates.append({
                        'videoId': video_id,
                        'title': d.get('title') or '',
                        'channel': candidate_channel,
                        'duration': d.get('duration') or 0,
                        'source': source,
                        'resultType': 'song' if source == 'youtube_music' else 'video',
                        'artist': candidate_artist,
                        'album': d.get('album') or '',
                        'isrc': d.get('isrc') or '',
                        'edition': 'unknown',
                        'sourceCodec': d.get('acodec') or '',
                        'sourceAbr': d.get('abr') or 0,
                    })
                except Exception:
                    continue
            candidates = candidates[:limit]
            if deep:
                if len(candidates) > 1:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                        futures = [
                            executor.submit(self._enrich_candidate, candidate)
                            for candidate in candidates[:2]
                        ]
                        for future in futures:
                            try:
                                future.result()
                            except Exception:
                                pass
                elif candidates:
                    self._enrich_candidate(candidates[0])
            return {'success': True, 'candidates': candidates}
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Candidate search timeout'}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def _enrich_candidate(self, candidate: dict) -> None:
        video_id = candidate.get('videoId') or ''
        if not video_id:
            return
        args = [
            _bin('yt-dlp.exe'), f'https://www.youtube.com/watch?v={video_id}',
            '--dump-single-json', '--skip-download', '--no-playlist',
            '--socket-timeout', '12', '--retries', '1', '--quiet', '--no-warnings',
        ]
        try:
            result = subprocess.run(
                args, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
                timeout=15, encoding='utf-8', errors='replace',
            )
            if result.returncode != 0 or not result.stdout.strip():
                return
            detail = json.loads(result.stdout.strip().splitlines()[-1])
            detail_artist = _metadata_text(
                detail, 'artist', 'artists', 'creator', 'creators',
                'album_artist', 'album_artists',
            )
            detail_channel = _metadata_text(detail, 'channel', 'uploader') or detail_artist
            candidate.update({
                'duration': detail.get('duration') or candidate.get('duration') or 0,
                'channel': detail_channel or candidate.get('channel') or '',
                'artist': detail_artist or candidate.get('artist') or '',
                'album': detail.get('album') or candidate.get('album') or '',
                'isrc': detail.get('isrc') or '',
                'sourceCodec': detail.get('acodec') or '',
                'sourceAbr': detail.get('abr') or 0,
            })
        except Exception:
            return

    def get_playlist_items(self, url: str, limit: int = 50) -> dict:
        """Extrae ítems de una playlist de YouTube / YouTube Music con validación OWASP."""
        if not isinstance(url, str) or not url.strip():
            return {'success': False, 'error': 'Invalid playlist URL'}

        parsed = urlparse(url.strip())
        host = (parsed.hostname or '').rstrip('.').lower()
        if (
            parsed.scheme != 'https'
            or host not in {'www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'}
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
        ):
            return {'success': False, 'error': 'Unsupported YouTube playlist host'}

        query_params = parse_qs(parsed.query, keep_blank_values=False)
        list_values = query_params.get('list') or []
        list_id = list_values[0].strip() if list_values else ''
        if not list_id or not re.fullmatch(r'[a-zA-Z0-9_-]{8,128}', list_id):
            return {'success': False, 'error': 'Invalid YouTube playlist list parameter'}

        try:
            if isinstance(limit, bool):
                clamped_limit = 50
            else:
                clamped_limit = min(max(1, int(limit)), 50)
        except (TypeError, ValueError):
            clamped_limit = 50

        canonical_url = f'https://www.youtube.com/playlist?list={list_id}'
        args = [
            _bin('yt-dlp.exe'),
            canonical_url,
            '--flat-playlist',
            '--dump-json',
            '--playlist-end', str(clamped_limit),
            '--socket-timeout', '12',
            '--retries', '2',
            '--quiet',
            '--no-warnings',
        ]
        try:
            r = subprocess.run(
                args,
                capture_output=True,
                text=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=25,
                encoding='utf-8',
                errors='replace',
            )
            if r.returncode != 0:
                err_text = (r.stderr or '').strip()
                if _is_outdated_ytdlp_error(err_text) and self._try_reactive_ytdlp_update():
                    args[0] = _bin('yt-dlp.exe')
                    r = subprocess.run(
                        args,
                        capture_output=True,
                        text=True,
                        creationflags=CREATE_NO_WINDOW,
                        timeout=25,
                        encoding='utf-8',
                        errors='replace',
                    )
                if r.returncode != 0:
                    return {'success': False, 'error': (r.stderr or 'yt-dlp playlist fetch failed').strip()}

            playlist_title = ''
            playlist_count: int | None = None
            items: list[dict] = []
            for line in (r.stdout or '').splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if not isinstance(d, dict):
                    continue
                if not playlist_title:
                    raw_pl_title = d.get('playlist_title') or d.get('playlist') or ''
                    if isinstance(raw_pl_title, str) and raw_pl_title.strip():
                        playlist_title = raw_pl_title.strip()
                if playlist_count is None:
                    raw_count = d.get('playlist_count')
                    if raw_count is None:
                        raw_count = d.get('n_entries')
                    if isinstance(raw_count, int) and not isinstance(raw_count, bool) and raw_count >= 0:
                        playlist_count = raw_count

                video_id = str(d.get('id') or '').strip()
                if not video_id:
                    continue
                channel = _metadata_text(
                    d, 'channel', 'uploader', 'artist', 'artists', 'creator',
                )
                thumbnail = ''
                raw_thumb = d.get('thumbnail')
                if isinstance(raw_thumb, str) and raw_thumb.strip():
                    thumbnail = raw_thumb.strip()
                else:
                    thumbs = d.get('thumbnails')
                    if isinstance(thumbs, list):
                        for thumb in reversed(thumbs):
                            if isinstance(thumb, dict) and isinstance(thumb.get('url'), str) and thumb['url'].strip():
                                thumbnail = thumb['url'].strip()
                                break
                if not thumbnail and re.fullmatch(r'[a-zA-Z0-9_-]{11}', video_id):
                    thumbnail = f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg'

                items.append({
                    'videoId': video_id,
                    'title': str(d.get('title') or '').strip(),
                    'channel': channel,
                    'duration': d.get('duration') or 0,
                    'thumbnail': thumbnail,
                })
                if len(items) >= clamped_limit:
                    break

            has_more = (
                playlist_count > len(items)
                if playlist_count is not None
                else len(items) >= clamped_limit
            )
            return {'success': True, 'title': playlist_title, 'items': items, 'hasMore': has_more}
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Playlist fetch timeout'}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def letras_fetch(self, url: str) -> dict:
        parsed = urlparse(url or '')
        if parsed.scheme != 'https' or parsed.netloc not in {
            'www.letras.com', 'letras.com', 'genius.com', 'www.genius.com'
        }:
            return {'success': False, 'error': 'URL de letras.com o genius.com inválida'}

        try:
            response = _http_get(
                url,
                timeout=12,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Android; Mobile)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                },
            )
            if not response.ok:
                return {'success': False, 'error': f'letras.com respondió HTTP {response.status_code}'}
            return {'success': True, 'html': response.text, 'url': response.url}
        except requests.RequestException as exc:
            return {'success': False, 'error': str(exc)}

    def lrclib_fetch(self, url: str) -> dict:
        parsed = urlparse(url or '')
        if parsed.scheme != 'https' or parsed.netloc != 'lrclib.net':
            return {'success': False, 'error': 'URL de lrclib inválida'}

        try:
            response = _http_get(
                url,
                timeout=12,
                allow_redirects=False,
                headers={
                    'User-Agent': f'MHLMusic/{APP_VERSION} (https://github.com/ParaSyteTwo/music-mhl)',
                    'Lrclib-Client': f'MHLMusic/{APP_VERSION} (https://github.com/ParaSyteTwo/music-mhl)',
                },
            )
            status_code = getattr(response, 'status_code', 200)
            if not response.ok or (isinstance(status_code, int) and status_code >= 300):
                return {'success': False, 'status': status_code, 'error': f'lrclib respondió HTTP {status_code}'}
            return {'success': True, 'data': response.json()}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def spotify_embed_fetch(self, url: str) -> dict:
        """Descarga HTML de embed oficial de Spotify (album/playlist) sin redirects ciegos."""
        if not isinstance(url, str):
            return {'success': False, 'error': 'Invalid Spotify embed URL'}
        clean_url = url.strip()
        if not re.fullmatch(
            r'https://open\.spotify\.com/embed/(album|playlist)/([a-zA-Z0-9]{8,40})',
            clean_url,
        ):
            return {'success': False, 'error': 'URL de Spotify embed inválida'}

        try:
            response = _http_get(
                clean_url,
                timeout=12,
                allow_redirects=False,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 (KHTML, like Gecko) '
                        'Chrome/124.0.0.0 Safari/537.36'
                    ),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            )
            status_code = getattr(response, 'status_code', 200)
            if not response.ok or (isinstance(status_code, int) and status_code >= 300):
                return {'success': False, 'error': f'Spotify respondió HTTP {status_code}'}
            return {'success': True, 'html': response.text}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def get_raw_audio(
        self,
        video_id: str | None,
        title: str,
        artist: str,
        queries: list,
        source_url: str | None = None,
        expected_duration: int | float = 0,
        audio_format: str = 'm4a',
        return_path: bool = False,
    ) -> dict:
        """
        Descarga audio y retorna ruta temporal (Zero-Base64) o bytes en base64 + metadata al frontend.
        """
        if source_url:
            parsed = urlparse(source_url)
            if parsed.scheme != 'https' or parsed.hostname != 'a.animethemes.moe':
                return {'success': False, 'error': 'Unsupported source URL'}

        if not video_id and not source_url:
            return {'success': False, 'error': 'candidate_invalid: resolved videoId required'}

        if video_id and (not isinstance(video_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', video_id)):
            return {'success': False, 'error': 'candidate_invalid: invalid videoId format'}

        is_mp3 = str(audio_format).lower() == 'mp3'
        ext = 'mp3' if is_mp3 else 'm4a'
        tmpdir = tempfile.mkdtemp(prefix='mhl_')
        tmppath = os.path.join(tmpdir, f'audio.{ext}')
        dest_dir: Path | None = None

        try:
            input_url = source_url or f'https://www.youtube.com/watch?v={video_id}'
            format_opts = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '320K'] if is_mp3 else ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-x', '--audio-format', 'm4a', '--audio-quality', '0']
            args = [
                _bin('yt-dlp.exe'),
                input_url,
                *format_opts,
                '-o', tmppath,
                '--no-playlist', '--force-overwrites',
                '--no-part', '--concurrent-fragments', '4',
                '--ffmpeg-location', _bin('ffmpeg.exe'),
                '--socket-timeout', '15', '--retries', '2', '--fragment-retries', '2',
                '--quiet',
            ]
            proc = subprocess.run(
                args,
                capture_output=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=300,
                encoding='utf-8',
                errors='replace',
            )

            result_path = tmppath
            if not os.path.exists(result_path):
                files = list(Path(tmpdir).iterdir())
                if files:
                    result_path = str(files[0])

            if proc.returncode != 0 or not os.path.exists(result_path):
                err_detail = (proc.stderr or '').strip()
                if _is_outdated_ytdlp_error(err_detail) and self._try_reactive_ytdlp_update():
                    args[0] = _bin('yt-dlp.exe')
                    proc = subprocess.run(
                        args,
                        capture_output=True,
                        creationflags=CREATE_NO_WINDOW,
                        timeout=300,
                        encoding='utf-8',
                        errors='replace',
                    )
                    if os.path.exists(tmppath):
                        result_path = tmppath
                    else:
                        files = list(Path(tmpdir).iterdir())
                        if files:
                            result_path = str(files[0])

                if proc.returncode != 0 or not os.path.exists(result_path):
                    err_detail = (proc.stderr or '').strip()
                    error_type = 'rate_limit' if re.search(r'403|forbidden|rate.?limit', err_detail, re.I) else 'extraction'
                    return {'success': False, 'error': f'{error_type}: yt-dlp error {proc.returncode}: {err_detail}'}

            if os.path.getsize(result_path) < 16 * 1024:
                return {'success': False, 'error': 'conversion: output file is too small'}

            actual_duration = 0.0
            probed_by_mutagen = False
            try:
                import mutagen
                audio_info = mutagen.File(result_path)
                if audio_info is not None and getattr(audio_info, 'info', None) is not None:
                    length = getattr(audio_info.info, 'length', 0)
                    if length and float(length) > 0:
                        actual_duration = float(length)
                        probed_by_mutagen = True
            except Exception:
                probed_by_mutagen = False

            if not probed_by_mutagen:
                probe = subprocess.run(
                    [_bin('ffmpeg.exe'), '-v', 'info', '-t', '1', '-i', result_path, '-f', 'null', '-'],
                    capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=45,
                    encoding='utf-8', errors='replace',
                )
                if probe.returncode != 0:
                    return {'success': False, 'error': 'conversion: MP3 is not decodable'}
                duration_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', probe.stderr or '')
                if duration_match:
                    actual_duration = (
                        int(duration_match.group(1)) * 3600
                        + int(duration_match.group(2)) * 60
                        + float(duration_match.group(3))
                    )

            if expected_duration and actual_duration:
                tolerance = max(5.0, float(expected_duration) * 0.05)
                if abs(actual_duration - float(expected_duration)) > tolerance:
                    return {'success': False, 'error': 'candidate_invalid: downloaded duration mismatch'}

            if return_path:
                dest_dir = _TEMP_AUDIO_DIR / uuid.uuid4().hex
                dest_dir.mkdir(parents=True, exist_ok=True)
                final_temp = dest_dir / f'audio.{ext}'
                shutil.move(result_path, str(final_temp))
                file_size = final_temp.stat().st_size
                dest_dir = None
                return {
                    'success': True,
                    'temp_path': str(final_temp),
                    'videoId': video_id,
                    'sourceUrl': source_url,
                    'ext': ext,
                    'duration': actual_duration,
                    'size': file_size,
                }

            audio_bytes = Path(result_path).read_bytes()
            b64 = _encode_audio_bytes(audio_bytes)
            return {
                'success': True,
                'data_b64': b64,
                'videoId': video_id,
                'sourceUrl': source_url,
                'ext': ext,
                'duration': actual_duration,
                'size': len(audio_bytes),
            }

        except Exception as e:
            if dest_dir is not None:
                shutil.rmtree(dest_dir, ignore_errors=True)
            return {'success': False, 'error': str(e)}
        finally:
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass

    def write_file_bytes(self, file_path: str, data: list[int]) -> dict:
        """Escribe bytes recibidos del frontend (ArrayBuffer convertido a list[int])."""
        try:
            root = Path(settings.get(
                'download_folder',
                str(Path.home() / 'Music' / 'MHL Music'),
            )).resolve()
            target = Path(file_path).resolve()
            try:
                target.relative_to(root)
            except ValueError:
                return {'success': False, 'error': 'Path outside download folder'}
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bytes(data))
            return {'success': True, 'size': target.stat().st_size}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_settings(self) -> dict:
        return {
            'download_folder': settings.get(
                'download_folder',
                str(Path.home() / 'Music' / 'MHL Music'),
            ),
        }

    def get_device_context(self) -> dict:
        locale_name = ''
        battery_percent = 100
        charging = True
        available_memory_mb = 0
        total_memory_mb = 0
        if sys.platform == 'win32':
            try:
                import ctypes

                locale_buffer = ctypes.create_unicode_buffer(85)
                ctypes.windll.kernel32.GetUserDefaultLocaleName(locale_buffer, len(locale_buffer))
                locale_name = locale_buffer.value

                class MemoryStatus(ctypes.Structure):
                    _fields_ = [
                        ('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                        ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                        ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                        ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                        ('ullAvailExtendedVirtual', ctypes.c_ulonglong),
                    ]

                memory = MemoryStatus()
                memory.dwLength = ctypes.sizeof(MemoryStatus)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
                    available_memory_mb = round(memory.ullAvailPhys / 1048576)
                    total_memory_mb = round(memory.ullTotalPhys / 1048576)

                class PowerStatus(ctypes.Structure):
                    _fields_ = [
                        ('ACLineStatus', ctypes.c_ubyte), ('BatteryFlag', ctypes.c_ubyte),
                        ('BatteryLifePercent', ctypes.c_ubyte), ('SystemStatusFlag', ctypes.c_ubyte),
                        ('BatteryLifeTime', ctypes.c_ulong), ('BatteryFullLifeTime', ctypes.c_ulong),
                    ]

                power = PowerStatus()
                if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(power)):
                    charging = power.ACLineStatus == 1
                    battery_percent = power.BatteryLifePercent if power.BatteryLifePercent <= 100 else -1
            except Exception:
                pass
        return {
            'online': True,
            'metered': False,
            'networkType': 'other',
            'batteryPercent': battery_percent,
            'charging': charging,
            'batterySaver': False,
            'availableMemoryMb': available_memory_mb,
            'totalMemoryMb': total_memory_mb,
            'processors': os.cpu_count() or 4,
            'locale': locale_name or 'en-US',
        }

    def save_setting(self, key: str, value) -> dict:
        settings.set(key, value)
        return {'success': True}

    def frontend_ready(self) -> dict:
        """Marca la ventana como lista solo después de que React haya montado."""
        window = getattr(self, '_window', None)
        if window is None:
            return {'success': False}
        window.set_title('MHL Music')
        return {'success': True}

    # ── Filesystem helpers ────────────────────────────────────────────────────

    def pick_folder(self) -> str:
        """Abre un diálogo nativo para elegir carpeta (wrapper de webview.windows[0].create_file_dialog)."""
        import webview
        try:
            window = webview.windows[0]
            result = window.create_file_dialog(webview.FOLDER_DIALOG)
            if result and len(result) > 0:
                return result[0]
        except Exception as e:
            print(f"[bridge] error picking folder: {e}")
        return ""

    def open_file(self, file_path: str) -> dict:
        """Abre un archivo de audio/carpeta descargada usando la aplicación por defecto del sistema."""
        try:
            import os
            target_path = Path(file_path).resolve()
            if not target_path.exists():
                root = Path(settings.get('download_folder', str(Path.home() / 'Music' / 'MHL Music'))).resolve()
                alt_path = (root / file_path).resolve()
                if alt_path.exists():
                    target_path = alt_path
                else:
                    return {'success': False, 'error': 'File not found'}

            # Validar que no sea un ejecutable o script malicioso
            if target_path.is_file():
                allowed_extensions = {
                    '.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac',
                    '.lrc', '.txt', '.json', '.jpg', '.jpeg', '.png', '.webp', '.svg',
                }
                if target_path.suffix.lower() not in allowed_extensions:
                    return {'success': False, 'error': 'Security check: File extension not allowed'}

            # Solo para Windows
            os.startfile(str(target_path))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── App Info & Auto-Updater ───────────────────────────────────────────────

    def get_app_info(self) -> dict:
        """Devuelve información de la versión e instalación de la aplicación Desktop."""
        frozen = getattr(sys, 'frozen', False)
        app_dir = str(Path(sys.executable).parent if frozen else Path(__file__).parent)
        return {
            'success': True,
            'version': APP_VERSION,
            'frozen': frozen,
            'app_dir': app_dir,
            'platform': 'desktop',
        }

    def apply_desktop_update(self, zip_url: str, version: str) -> dict:
        """
        Descarga el paquete portable .zip de GitHub, genera el script de auto-actualización
        y lanza el proceso de reemplazo independiente que reiniciará MHL Music.
        """
        if not zip_url or not zip_url.startswith('https://'):
            return {'success': False, 'error': 'Invalid download URL'}

        # Sanitizar versión para evitar path traversal
        clean_version = re.sub(r'[^0-9a-zA-Z._-]', '', version or '')
        if not clean_version:
            return {'success': False, 'error': 'Invalid version parameter'}

        frozen = getattr(sys, 'frozen', False)
        app_dir = Path(sys.executable).parent if frozen else Path(__file__).parent
        exe_name = Path(sys.executable).name if frozen else 'MHL Music.exe'
        current_pid = os.getpid()

        # Carpeta temporal única y segura por intento
        update_temp_dir = Path(tempfile.mkdtemp(prefix='mhl_update_'))
        zip_dest = update_temp_dir / f'MHL-Music-Portable-{clean_version}.zip'
        script_path = update_temp_dir / 'update_runner.ps1'

        try:
            # 1. Descargar el zip con timeout de conexión y lectura
            resp = requests.get(zip_url, stream=True, timeout=(10, 180))
            if resp.status_code != 200:
                shutil.rmtree(update_temp_dir, ignore_errors=True)
                return {'success': False, 'error': f'Download failed with HTTP {resp.status_code}'}

            with open(zip_dest, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)

            # 2. Generar el script de actualización en PowerShell con paso de argumentos y rollback
            ps_script = '''# MHL Music Desktop Updater
param(
    [Parameter(Mandatory=$true)][int]$pidToWait,
    [Parameter(Mandatory=$true)][string]$targetAppDir,
    [Parameter(Mandatory=$true)][string]$archivePath,
    [Parameter(Mandatory=$true)][string]$executableName
)

$ErrorActionPreference = 'SilentlyContinue'

# Esperar a que el proceso principal cierre
try {
    Wait-Process -Id $pidToWait -Timeout 25
} catch {}
Start-Sleep -Seconds 1

# Si sigue corriendo por alguna razón, forzar término
Stop-Process -Id $pidToWait -Force -ErrorAction SilentlyContinue

# Terminar procesos secundarios huérfanos que puedan bloquear ejecutables (yt-dlp, ffmpeg)
Get-Process -Name 'yt-dlp', 'ffmpeg' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Extraer contenido en subcarpeta temporal
$extractDir = Join-Path (Split-Path $archivePath) 'extracted'
if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir -Force

# Preservar MHL Music.exe.config preexistente
$configPath = Join-Path $targetAppDir 'MHL Music.exe.config'
$configBackup = Join-Path (Split-Path $archivePath) 'MHL Music.exe.config.bak'
if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination $configBackup -Force
}

# Copiar archivos a la carpeta de la aplicación con reintentos
$copied = $false
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try {
        Copy-Item -Path (Join-Path $extractDir '*') -Destination $targetAppDir -Recurse -Force
        $copied = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $copied) {
    robocopy $extractDir $targetAppDir /E /IS /IT /NP /R:3 /W:1 | Out-Null
}

# Restaurar o asegurar configuración .NET
if (Test-Path -LiteralPath $configBackup) {
    Copy-Item -LiteralPath $configBackup -Destination $configPath -Force
}

# Limpiar temporales
Remove-Item -LiteralPath $extractDir -Recurse -Force
Remove-Item -LiteralPath $archivePath -Force

# Desbloquear todos los archivos (Zone.Identifier) de forma robusta
Get-ChildItem -LiteralPath $targetAppDir -Recurse -Force | Unblock-File -ErrorAction SilentlyContinue

# Reiniciar la aplicación actualizada
$targetExe = Join-Path $targetAppDir $executableName
if (Test-Path -LiteralPath $targetExe) {
    Start-Process -FilePath $targetExe
}
'''
            script_path.write_text(ps_script, encoding='utf-8')

            # 3. Lanzar el helper de PowerShell pasando parámetros de forma segura
            DETACHED_FLAGS = 0x00000008 | 0x08000000 if sys.platform == 'win32' else 0  # DETACHED_PROCESS | CREATE_NO_WINDOW
            cmd = [
                'powershell.exe',
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-File', str(script_path),
                '-pidToWait', str(current_pid),
                '-targetAppDir', str(app_dir),
                '-archivePath', str(zip_dest),
                '-executableName', str(exe_name),
            ]
            subprocess.Popen(cmd, creationflags=DETACHED_FLAGS, close_fds=True)

            # 4. Programar cierre de la app actual
            def _close_app():
                time.sleep(0.6)
                window = getattr(self, '_window', None)
                if window:
                    try:
                        window.destroy()
                    except Exception:
                        pass
                os._exit(0)

            threading.Thread(target=_close_app, daemon=True).start()

            return {'success': True, 'started': True}
        except Exception as exc:
            shutil.rmtree(update_temp_dir, ignore_errors=True)
            return {'success': False, 'error': str(exc)}

    def export_backup(self, json_content: str, default_name: str = '') -> dict:
        """Guarda una copia de seguridad JSON usando diálogo nativo o Documentos/MHL Music."""
        if not isinstance(json_content, str) or not json_content.strip():
            return {'success': False, 'error': 'Empty backup content'}
        try:
            json.loads(json_content)
        except Exception:
            return {'success': False, 'error': 'Invalid backup JSON'}

        raw_name = str(default_name or '').strip()
        safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', raw_name).strip(' .')
        if not safe_name:
            safe_name = f"mhl-music-backup-{time.strftime('%Y-%m-%d')}.json"
        if not safe_name.lower().endswith('.json'):
            safe_name = f'{safe_name}.json'

        fallback_dir = (Path.home() / 'Documents' / 'MHL Music').resolve()
        dest_path: Path | None = None
        try:
            import webview
            windows = getattr(webview, 'windows', None)
            if windows:
                save_dialog = getattr(webview, 'SAVE_DIALOG', None)
                if save_dialog is not None:
                    fallback_dir.mkdir(parents=True, exist_ok=True)
                    result = windows[0].create_file_dialog(
                        save_dialog,
                        directory=str(fallback_dir),
                        save_filename=safe_name,
                        file_types=('JSON Backup (*.json)',),
                    )
                    if not result:
                        return {'success': False, 'cancelled': True}
                    picked = result[0] if isinstance(result, (list, tuple)) else result
                    if isinstance(picked, str) and picked.strip():
                        dest_path = Path(picked.strip()).resolve()
        except Exception:
            dest_path = None

        if dest_path is None:
            fallback_dir.mkdir(parents=True, exist_ok=True)
            dest_path = (fallback_dir / safe_name).resolve()

        if not str(dest_path).lower().endswith('.json'):
            dest_path = Path(f'{dest_path}.json')

        try:
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_text(json_content, encoding='utf-8')
            return {'success': True, 'filePath': str(dest_path), 'fileName': dest_path.name}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    def import_backup(self) -> dict:
        """Abre un diálogo nativo para seleccionar y validar una copia de seguridad JSON."""
        fallback_dir = (Path.home() / 'Documents' / 'MHL Music').resolve()
        try:
            import webview
            windows = getattr(webview, 'windows', None)
            if not windows:
                return {'success': False, 'error': 'Desktop window not available'}
            open_dialog = getattr(webview, 'OPEN_DIALOG', None)
            result = windows[0].create_file_dialog(
                open_dialog,
                directory=str(fallback_dir) if fallback_dir.exists() else '',
                allow_multiple=False,
                file_types=('JSON Backup (*.json)', 'All files (*.*)'),
            )
            if not result:
                return {'success': False, 'cancelled': True}
            picked = result[0] if isinstance(result, (list, tuple)) else result
            src_path = Path(str(picked)).resolve()
            if not src_path.exists() or not src_path.is_file():
                return {'success': False, 'error': 'Selected backup file not found'}
            if src_path.stat().st_size > 10 * 1024 * 1024:
                return {'success': False, 'error': 'Backup file exceeds 10 MB limit'}
            raw_text = src_path.read_text(encoding='utf-8')
            json.loads(raw_text)
            return {'success': True, 'data': raw_text, 'filePath': str(src_path)}
        except json.JSONDecodeError:
            return {'success': False, 'error': 'Corrupt backup JSON'}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

