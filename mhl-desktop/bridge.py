"""
MHL Music — Python bridge expuesto al frontend React via pywebview.
Todas las llamadas externas (Deezer, YouTube/yt-dlp, filesystem) pasan por aquí.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys

# CREATE_NO_WINDOW para evitar popup de consola en Windows
CREATE_NO_WINDOW = 0x08000000 if sys.platform == 'win32' else 0
import tempfile
import threading
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests

from settings import settings

# ── Binarios yt-dlp / ffmpeg ─────────────────────────────────────────────────

def _assets_dir() -> Path:
    """Funciona tanto en desarrollo como dentro del .exe de PyInstaller."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'assets'   # type: ignore[attr-defined]
    return Path(__file__).parent / 'assets'

_ASSETS = _assets_dir()


def _bin(name: str) -> str:
    p = _ASSETS / name
    return str(p) if p.exists() else name


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


# ── Anime client (AniList + animethemes.moe) ─────────────────────────────────
# Implementación síncrona con `requests`, que ya forma parte del runtime Desktop.

_ANILIST_ENDPOINT = 'https://graphql.anilist.co'
_ANIMETHEMES_ENDPOINT = 'https://api.animethemes.moe'
_ANIME_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'MHLMusic/1.5.1-beta.8',
}
_ANIME_TIMEOUT = 10

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
    title { romaji english native }
  }
}
"""

_HTML_TAG_RE = re.compile(r'<[^>]+>')


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
    response = requests.post(url, json=payload, headers=_ANIME_HEADERS, timeout=_ANIME_TIMEOUT)
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


def _anime_search_animethemes(name):
    response = requests.get(
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
    for result in results:
        if not isinstance(result, dict):
            continue
        candidate = re.sub(r'\W+', '', str(result.get('name') or '')).casefold()
        if candidate == normalized_name:
            return result
    return None


def _anime_fetch_themes(anime_slug):
    response = requests.get(
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


def _anime_get_themes(anilist_id):
    if not isinstance(anilist_id, int) or anilist_id <= 0:
        raise ValueError('anilist_id must be a positive integer')

    meta = _anime_fetch_meta(anilist_id)
    if meta is None:
        return []
    romaji, english, _native = _anime_titles(meta.get('title'))
    search_name = english or romaji
    if not search_name:
        return []

    anime_node = _anime_search_animethemes(search_name)
    if anime_node is None:
        return []
    anime_slug = anime_node.get('slug')
    if not isinstance(anime_slug, str) or not anime_slug:
        return []

    raw_themes = _anime_fetch_themes(anime_slug)
    return _anime_shape_themes(raw_themes, anilist_id)



# ── Bridge ────────────────────────────────────────────────────────────────────

class Bridge:
    """
    Métodos públicos → accesibles desde JS como window.pywebview.api.<método>().
    Todos devuelven valores JSON-serializables (dict / list / str / int / bool / None).
    """

    def __init__(self):
        self._window = None  # asignado por launcher después de create_window
        self._dl_lock = threading.Lock()

    # ── Deezer (llamadas directas a api.deezer.com desde Python, sin CORS) ───

    def deezer_search(self, query: str, limit: int = 25, offset: int = 0) -> dict:
        try:
            r = requests.get(
                'https://api.deezer.com/search',
                params={'q': query, 'limit': limit, 'index': offset},
                timeout=10,
            )
            return r.json()
        except Exception as e:
            return {'data': [], 'total': 0, 'error': str(e)}

    def deezer_track(self, track_id: str) -> dict:
        try:
            r = requests.get(f'https://api.deezer.com/track/{track_id}', timeout=10)
            return r.json()
        except Exception as e:
            return {'error': str(e)}

    def deezer_album(self, album_id: str) -> dict:
        try:
            r = requests.get(f'https://api.deezer.com/album/{album_id}', timeout=10)
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
        audio_b64: str,
        title: str,
        artist: str,
        album: str,
        cover_url: str | None,
        lyrics: str | None,
        album_artist: str | None = None,
        composer: str | None = None,
        genre: str | None = None,
        year: str | int | None = None,
        track_number: int | str | None = None,
        track_total: int | str | None = None,
        disc_number: int | str | None = None,
        disc_total: int | str | None = None,
    ) -> dict:
        """Escribe M4A a disco e inyecta metadata via Mutagen."""
        try:
            target_path = Path(file_path).resolve()
            target_path.parent.mkdir(parents=True, exist_ok=True)
            audio_bytes = base64.b64decode(audio_b64)
            target_path.write_bytes(audio_bytes)
            
            from mutagen.mp4 import MP4, MP4Cover
            
            audio = MP4(str(target_path))
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
                try:
                    res = requests.get(cover_url, timeout=10)
                    if res.ok:
                        audio["covr"] = [MP4Cover(res.content, imageformat=MP4Cover.FORMAT_JPEG)]
                except Exception:
                    pass
                    
            audio.save()
            return {'success': True, 'size': target_path.stat().st_size}
        except Exception as e:
            return {'success': False, 'error': f'tagging failed: {str(e)}'}

    def anime_get_themes(self, anilist_id: int) -> dict:
        """
        Devuelve la lista de OP/ED de un anime (anilist_id) usando animethemes.moe.
        Devuelve {"success": True, "themes": [...]} o {"success": False, "error": str}.
        """
        try:
            themes = _anime_get_themes(anilist_id=anilist_id)
            return {'success': True, 'themes': themes}
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
                for candidate in candidates[:2]:
                    self._enrich_candidate(candidate)
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

    def letras_fetch(self, url: str) -> dict:
        parsed = urlparse(url or '')
        if parsed.scheme != 'https' or parsed.netloc not in {'www.letras.com', 'letras.com'}:
            return {'success': False, 'error': 'URL de letras.com inválida'}

        try:
            response = requests.get(
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

    def get_raw_audio(
        self,
        video_id: str | None,
        title: str,
        artist: str,
        queries: list,
        source_url: str | None = None,
        expected_duration: int | float = 0,
    ) -> dict:
        """
        Descarga audio y retorna bytes en base64 + metadata al frontend.
        El frontend escribe los ID3 tags con browser-id3-writer.
        """
        if source_url:
            parsed = urlparse(source_url)
            if parsed.scheme != 'https' or parsed.hostname != 'a.animethemes.moe':
                return {'success': False, 'error': 'Unsupported source URL'}

        if not video_id and not source_url:
            return {'success': False, 'error': 'candidate_invalid: resolved videoId required'}

        ext = 'm4a'
        tmpdir = tempfile.mkdtemp(prefix='mhl_')
        tmppath = os.path.join(tmpdir, f'audio.{ext}')

        try:
            input_url = source_url or f'https://www.youtube.com/watch?v={video_id}'
            args = [
                _bin('yt-dlp.exe'),
                input_url,
                '-f', 'bestaudio[ext=m4a]/bestaudio/best',
                '-x', '--audio-format', 'm4a',
                '--audio-quality', '0',
                '-o', tmppath,
                '--no-playlist', '--force-overwrites',
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
                error_type = 'rate_limit' if re.search(r'403|forbidden|rate.?limit', err_detail, re.I) else 'extraction'
                return {'success': False, 'error': f'{error_type}: yt-dlp error {proc.returncode}: {err_detail}'}

            if os.path.getsize(result_path) < 16 * 1024:
                return {'success': False, 'error': 'conversion: output file is too small'}

            probe = subprocess.run(
                [_bin('ffmpeg.exe'), '-v', 'info', '-i', result_path, '-f', 'null', '-'],
                capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=45,
                encoding='utf-8', errors='replace',
            )
            if probe.returncode != 0:
                return {'success': False, 'error': 'conversion: MP3 is not decodable'}
            duration_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', probe.stderr or '')
            actual_duration = 0.0
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
            if target.parent != root:
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
        """Abre un archivo (o carpeta) usando la aplicación por defecto del sistema."""
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
                
            # Solo para Windows
            os.startfile(str(target_path))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
