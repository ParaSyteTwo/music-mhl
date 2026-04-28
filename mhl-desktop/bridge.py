"""
MHL Music — Python bridge expuesto al frontend React via pywebview.
Todas las llamadas externas (Deezer, YouTube/yt-dlp, filesystem) pasan por aquí.
Cero dependencia del backend Fly.io.
"""
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


# ── Helpers internos ──────────────────────────────────────────────────────────

def _quality_arg(quality: str) -> str:
    return {'alta': '0', 'media': '5', 'baja': '9'}.get(quality, '0')


def _safe(s: str) -> str:
    return re.sub(r'[/\\?%*:|"<>]', '', s).strip()



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

    def deezer_artist(self, artist_id: str) -> dict:
        try:
            info, top, albums, related = [
                requests.get(url, timeout=10).json()
                for url in [
                    f'https://api.deezer.com/artist/{artist_id}',
                    f'https://api.deezer.com/artist/{artist_id}/top?limit=10',
                    f'https://api.deezer.com/artist/{artist_id}/albums?limit=10',
                    f'https://api.deezer.com/artist/{artist_id}/related?limit=8',
                ]
            ]
            return {'success': True, 'info': info, 'top': top, 'albums': albums, 'related': related}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ── YouTube search ────────────────────────────────────────────────────────

    def _is_anime_like(self, title: str, artist: str, album: str) -> bool:
        """Detecta si una track parece anime."""
        source = f"{title} {artist} {album}".lower()
        return bool(re.search(r'(anime|opening|ending|\bop\b|\bed\b|theme|ost|project|isekai)', source))

    def _build_anime_queries(self, title: str, artist: str) -> list[str]:
        """Genera queries numeradas para Opening/Ending de anime."""
        queries = []
        for suffix in ['Opening', 'Ending', 'OP', 'ED']:
            for n in range(1, 6):
                queries.append(f'{title} {suffix} {n}')
                queries.append(f'{title} {suffix} {n} full')
        return queries

    def get_candidates(self, track_info: dict) -> dict:
        """
        Busca candidatos en YouTube y verifica por ISRC.
        """
        title = track_info.get('title', '')
        artist = track_info.get('artist', '')
        album = track_info.get('album', '')
        duration = track_info.get('duration', 0)
        deezer_isrc = track_info.get('isrc') or ''

        # Limpiar para el query — sin feat
        clean_title = self._clean_query(title)
        clean_artist = self._clean_query(artist)

        queries = [
            f'{clean_title} {clean_artist} official audio',
            f'{clean_title} {clean_artist}',
        ]

        # Si parece anime, agregar queries numeradas para Opening/Ending
        if self._is_anime_like(title, artist, album):
            queries.extend(self._build_anime_queries(clean_title, clean_artist))

        # Más queries en paralelo para anime
        max_workers = 4 if self._is_anime_like(title, artist, album) else 2
        limit_per_query = 4 if self._is_anime_like(title, artist, album) else 6

        from concurrent.futures import ThreadPoolExecutor, as_completed
        merged: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = {ex.submit(self._yt_search_fast, q, limit_per_query): q for q in queries}
            for fut in as_completed(futures):
                for result in fut.result():
                    vid = result['videoId']
                    if vid in merged:
                        continue
                    merged[vid] = {
                        **result,
                        'score': 0,
                        'label': self._label_fast(result),
                        'isrc_match': False,
                    }

        # Scoring para todos
        for vid, result in merged.items():
            result['score'] = self._score_smart(result, title, artist, duration)
            result['isrc_match'] = False

        # ISRC check solo para top 1 — evitar slowdown de 4 yt-dlp calls
        if deezer_isrc and merged:
            top_vid = max(merged, key=lambda v: merged[v]['score'])
            yt_isrc = self._get_yt_isrc(top_vid)
            if yt_isrc.upper() == deezer_isrc.upper():
                merged[top_vid]['score'] += 2000
                merged[top_vid]['isrc_match'] = True

        # Calcular confianza final basada en score
        for vid, result in merged.items():
            score = result['score']
            if result.get('isrc_match'):
                result['confidence'] = 'alta'
            elif score >= 120:
                result['confidence'] = 'alta'
            elif score >= 90:
                result['confidence'] = 'media'
            else:
                result['confidence'] = 'baja'

        candidates = sorted(merged.values(), key=lambda c: c['score'], reverse=True)[:4]
        return {'success': True, 'candidates': candidates}

    def _get_yt_isrc(self, video_id: str) -> str:
        """Obtiene el ISRC de un video de YouTube via yt-dlp."""
        args = [
            _bin('yt-dlp.exe'),
            f'https://www.youtube.com/watch?v={video_id}',
            '--dump-json', '--no-playlist', '--skip-download',
            '--quiet', '--no-warnings',
        ]
        try:
            r = subprocess.run(
                args, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
                timeout=10, encoding='utf-8', errors='replace',
            )
            for line in r.stdout.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    return d.get('isrc') or ''
                except Exception:
                    pass
        except Exception:
            pass
        return ''

    def _get_yt_thumbnail_url(self, video_id: str) -> str | None:
        """Extrae la URL de la miniatura de YouTube para un video dado."""
        args = [
            _bin('yt-dlp.exe'),
            f'https://www.youtube.com/watch?v={video_id}',
            '--dump-json', '--no-playlist', '--skip-download',
            '--quiet', '--no-warnings',
        ]
        try:
            r = subprocess.run(
                args, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
                timeout=10, encoding='utf-8', errors='replace',
            )
            for line in r.stdout.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    # thumbnails: array con multiple resoluciones. highest quality es thumbnail[-1]
                    thumbs = d.get('thumbnail') or ''
                    if not thumbs and 'thumbnails' in d:
                        thumbs_list = d.get('thumbnails') or []
                        if thumbs_list:
                            thumbs = thumbs_list[-1].get('url') or thumbs_list[-1].get('path') or ''
                    return thumbs if thumbs else None
                except Exception:
                    pass
        except Exception:
            pass
        return None

    def _download_cover_from_yt_thumbnail(self, video_id: str) -> tuple[bytes, str] | tuple[None, None]:
        """
        Descarga la miniatura de YouTube como imagen para el cover.
        Returns (image_bytes, mime_type) o (None, None) si falla.
        YouTube siempre tiene thumbnail, así que esto siempre debería funcionar.
        """
        thumb_url = self._get_yt_thumbnail_url(video_id)
        if not thumb_url:
            return None, None

        # YouTube thumbnails vienen en formatos como:
        # https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg
        # https://i.ytimg.com/vi/{video_id}/hqdefault.jpg
        # Asegurar que usamos max resolution
        if 'ytimg' in thumb_url and '/maxresdefault' not in thumb_url:
            thumb_url = thumb_url.replace('/hqdefault', '/maxresdefault').replace('/mqdefault', '/maxresdefault').replace('/sddefault', '/maxresdefault').replace('/default', '/maxresdefault')

        try:
            r = requests.get(thumb_url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.youtube.com/',
            })
            if r.ok and len(r.content) > 0:
                return r.content, r.headers.get('Content-Type', 'image/jpeg')
        except Exception as e:
            print(f'[DEBUG] YT thumbnail download error: {e}')
        return None, None

    def _yt_search_fast(self, query: str, limit: int = 4) -> list[dict]:
        """Scraping directo de YouTube — ~1-2s vs ~15s de yt-dlp."""
        import re
        try:
            url = f'https://www.youtube.com/results?search_query={requests.utils.quote(query)}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            r = requests.get(url, headers=headers, timeout=6)
            html = r.text

            # YouTube embeds ytInitialData como JSON en la página
            match = re.search(r'ytInitialData\s*=\s*(\{.*?\});\s*</script>', html, re.DOTALL)
            if not match:
                return []

            data = json.loads(match.group(1))
            results = []
            sections = (data.get('contents', {})
                        .get('twoColumnSearchResultsRenderer', {})
                        .get('primaryContents', {})
                        .get('sectionListRenderer', {})
                        .get('contents', []))
            for section in sections:
                for item in section.get('itemSectionRenderer', {}).get('contents', []):
                    vid = item.get('videoRenderer', {})
                    if not vid:
                        continue
                    video_id = vid.get('videoId', '')
                    if not video_id:
                        continue
                    # Título
                    title_runs = vid.get('title', {}).get('runs', [])
                    title_text = ''.join(r.get('text', '') for r in title_runs) if title_runs else ''
                    # Canal
                    channel_runs = vid.get('ownerText', {}).get('runs', [])
                    channel_text = channel_runs[0].get('text', '') if channel_runs else ''
                    # Duración
                    duration_text = vid.get('lengthText', {}).get('simpleText', '') or ''
                    duration_sec = self._parse_duration(duration_text)
                    results.append({
                        'videoId': video_id,
                        'title': title_text,
                        'channel': channel_text,
                        'duration': duration_sec,
                    })
                    if len(results) >= limit:
                        return results
            return results
        except Exception:
            return []

    def _parse_duration(self, s: str) -> int:
        """Parse '1:23:45' o '3:45' a segundos."""
        if not s:
            return 0
        parts = s.strip().split(':')
        try:
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            elif len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            return int(parts[0])
        except Exception:
            return 0

    def _clean_query(self, s: str) -> str:
        """Strip featuring, ft, remix, live, etc. de títulos y artistas para queries limpias."""
        import re
        # Quitar (feat. XXX), [feat XXX], - feat XXX, , feat XXX
        s = re.sub(r'[(\[]?(feat\.?|ft\.?|featuring)\s+[^)\]]+[)\]]?', '', s, flags=re.IGNORECASE)
        # Quitar (with XXX), [with XXX]
        s = re.sub(r'[(\[]?(with)\s+[^)\]]+[)\]]?', '', s, flags=re.IGNORECASE)
        # Quitar remix, radio edit, version, etc.
        s = re.sub(r'\b(remix|reprise|version|edit|live|acoustic|medley|mix)\b.*', '', s, flags=re.IGNORECASE)
        # Quitar paréntesis/corchetes redundantes
        s = re.sub(r'[()\[\]]+', ' ', s)
        # Quitar múltiples espacios
        s = re.sub(r'\s+', ' ', s).strip()
        return s

    def _score_smart(self, c: dict, title: str, artist: str, duration: int) -> int:
        """
        Scoring inteligente con match 1:1 feat Deezer↔YouTube.
        - Si Deezer tiene ft → solo aceptar YouTube con ft
        - Si Deezer NO tiene ft → solo aceptar YouTube sin ft (de otros artistas)
        """
        import re
        t = c.get('title', '').lower()
        ch = c.get('channel', '').lower()
        cd = c.get('duration') or 0

        # Título base limpio
        wt_base = self._clean_query(title).lower()
        wa_base = self._clean_query(artist).lower()

        # Detectar si es music video (para penalizar)
        yt_title_lower = c.get('title', '').lower()
        is_music_video = any(kw in yt_title_lower for kw in (
            'official music video', 'official video', 'music video', 'mv', 'm/v',
        ))

        score = 100

        # ── Sin discriminación por feat — mostrar todo, dejar elegir al usuario ──
        # El usuario conoce su canción y sabe qué versión quiere
        # Solo rankear por calidad técnica y match de título/duración

        # ── Título base match ───────────────────────────────────────────
        if wt_base and wt_base in t:
            score += 40
        elif wt_base and t and wt_base in t:
            score += 25
        else:
            wt_words = set(wt_base.split())
            t_words = set(t.split())
            common = wt_words & t_words
            if common and wt_words:
                score += 15 * len(common) / len(wt_words)

        # ── Artista principal (sin feat) ────────────────────────────────
        if wa_base:
            if wa_base in t or wa_base in ch:
                score += 22
            if wa_base in ch:
                score += 15

        # ── "official audio" / "official video" ─────────────────────────
        if 'official audio' in t:
            score += 18

        # ── Penalizar music videos (tienen intro/outro) ───────────────
        if is_music_video:
            score -= 25

        # ── Duración — match preciso = canción sin intro/outro ─────────
        if duration > 0 and cd > 0:
            diff_pct = abs(cd - duration) / duration
            if diff_pct <= 0.02:  # ~1-2s de diferencia en 3min = canción limpia
                score += 50  # Muy alto: es la versión limpia
            elif diff_pct <= 0.05:
                score += 30
            elif diff_pct <= 0.10:
                score += 15
            elif diff_pct >= 0.50:
                score -= 40  # Muy diferente = probablemente music video con intro/outro

        # ── Boostear si duración match + título match ─────────────────
        if duration > 0 and cd > 0 and abs(cd - duration) / duration < 0.05 and wt_base and wt_base in t:
            score += 20

        # ── Penalizadores ───────────────────────────────────────────────
        bad_patterns = ['karaoke', 'nightcore', 'sped up', 'slowed', 'reaction', 'amv',
                        'instrumental', '8d', 'reverb', 'bass boost']
        if any(b in t for b in bad_patterns):
            score -= 28
        if 'cover' in t and wa_base and wa_base not in ch:
            score -= 18
        if 'live' in t and 'official' not in t:
            score -= 12
        if any(b in t for b in ('lyrics', 'lyric video', 'sub esp', 'sub english')):
            score -= 10

        return score

    def _label_fast(self, c: dict) -> str:
        t = c.get('title', '').lower()
        ch = c.get('channel', '').lower()
        h = f"{t} {ch}"
        if any(b in h for b in ('opening', 'ending', ' op ', ' ed ', 'opening theme', 'ending theme')):
            return 'anime op/ed'
        if any(kw in t for kw in ('official music video', 'music video', 'm/v', 'mv')):
            return 'video'
        if 'remix' in t:
            return 'remix'
        if 'cover' in t:
            return 'cover'
        if 'live' in t and 'official' not in t:
            return 'live'
        if any(b in t for b in ('karaoke', 'nightcore', 'sped up', 'slowed', 'instrumental')):
            return 'bad'
        return 'song'

    def _confidence(self, score: int) -> str:
        if score >= 120:
            return 'alta'
        if score >= 90:
            return 'media'
        return 'baja'

    # ── Download audio ────────────────────────────────────────────────────────

    def download_and_save(self, params: dict) -> dict:
        """
        Descarga audio y retorna bytes + metadata al frontend.
        El frontend escribe los ID3 tags con browser-id3-writer.
        """
        video_id = params.get('videoId') or None
        title = params.get('title', '')
        artist = params.get('artist', '')
        album = params.get('album', '')
        cover_url = params.get('coverUrl', '')
        genre = params.get('genre')
        year = params.get('year')
        track_number = params.get('trackNumber')
        lyrics = params.get('lyrics')
        audio_format = params.get('format', 'mp3')
        quality = params.get('quality', 'alta')
        queries = params.get('queries') or [f'{title} {artist}', f'{title} {artist} official audio']

        print(f'[DEBUG] download_and_save: title={title}, artist={artist}, cover_url={cover_url[:50] if cover_url else "EMPTY"}...')

        if not video_id:
            for q in queries:
                results = self._yt_search(q, limit=5)
                if results:
                    scored = sorted(results, key=lambda r: self._score(r, title, artist, 0), reverse=True)
                    video_id = scored[0]['videoId']
                    break

        if not video_id:
            return {'success': False, 'error': 'No se encontró el video en YouTube'}

        ext = 'mp3' if audio_format == 'mp3' else 'm4a'
        output_dir = settings.get('download_folder', str(Path.home() / 'Music' / 'MHL Music'))
        os.makedirs(output_dir, exist_ok=True)
        safe_filename = f'{_safe(title)} - {_safe(artist)}.{ext}'
        output_path = os.path.join(output_dir, safe_filename)

        tmpdir = tempfile.mkdtemp(prefix='mhl_')
        tmppath = os.path.join(tmpdir, f'audio.{ext}')

        try:
            args = [
                _bin('yt-dlp.exe'),
                f'https://www.youtube.com/watch?v={video_id}',
                '-x', '--audio-format', audio_format,
                '--audio-quality', _quality_arg(quality),
                '-o', tmppath,
                '--no-playlist', '--force-overwrites',
                '--ffmpeg-location', _bin('ffmpeg.exe'),
                '--quiet',
            ]
            proc = subprocess.run(args, capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=300, encoding='utf-8', errors='replace')

            result_path = tmppath
            if not os.path.exists(result_path):
                files = list(Path(tmpdir).iterdir())
                if files:
                    result_path = str(files[0])

            if proc.returncode != 0 or not os.path.exists(result_path):
                err_detail = (proc.stderr or '').strip()
                return {'success': False, 'error': f'yt-dlp error {proc.returncode}: {err_detail}'}

            shutil.copy2(result_path, output_path)
            return {'success': True, 'filename': safe_filename, 'path': output_path}

        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Timeout: la descarga tardó demasiado'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass

    def get_raw_audio(self, video_id: str | None, title: str, artist: str, queries: list, audio_format: str = 'mp3', quality: str = 'alta') -> dict:
        """
        Descarga audio y retorna bytes en base64 + metadata al frontend.
        El frontend escribe los ID3 tags con browser-id3-writer.
        """
        if not video_id:
            for q in queries:
                results = self._yt_search(q, limit=5)
                if results:
                    scored = sorted(results, key=lambda r: self._score(r, title, artist, 0), reverse=True)
                    video_id = scored[0]['videoId']
                    break

        if not video_id:
            return {'success': False, 'error': 'No se encontró el video en YouTube'}

        ext = 'mp3' if audio_format == 'mp3' else 'm4a'
        tmpdir = tempfile.mkdtemp(prefix='mhl_')
        tmppath = os.path.join(tmpdir, f'audio.{ext}')

        try:
            args = [
                _bin('yt-dlp.exe'),
                f'https://www.youtube.com/watch?v={video_id}',
                '-x', '--audio-format', audio_format,
                '--audio-quality', _quality_arg(quality),
                '-o', tmppath,
                '--no-playlist', '--force-overwrites',
                '--ffmpeg-location', _bin('ffmpeg.exe'),
                '--quiet',
            ]
            proc = subprocess.run(args, capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=300, encoding='utf-8', errors='replace')

            result_path = tmppath
            if not os.path.exists(result_path):
                files = list(Path(tmpdir).iterdir())
                if files:
                    result_path = str(files[0])

            if proc.returncode != 0 or not os.path.exists(result_path):
                err_detail = (proc.stderr or '').strip()
                return {'success': False, 'error': f'yt-dlp error {proc.returncode}: {err_detail}'}

            audio_bytes = Path(result_path).read_bytes()
            b64 = audio_bytes.hex()
            return {
                'success': True,
                'data_b64': b64,
                'videoId': video_id,
                'ext': ext,
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
            Path(file_path).write_bytes(bytes(data))
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_settings(self) -> dict:
        return {
            'format': settings.get('format', 'mp3'),
            'quality': settings.get('quality', 'alta'),
            'download_folder': settings.get(
                'download_folder',
                str(Path.home() / 'Music' / 'MHL Music'),
            ),
        }

    def save_setting(self, key: str, value) -> dict:
        settings.set(key, value)
        return {'success': True}

    # ── Filesystem helpers ────────────────────────────────────────────────────

    def pick_folder(self) -> str:
        """Abre un diálogo para elegir carpeta. Devuelve la ruta o ''."""
        import tkinter as tk
        import tkinter.filedialog as fd
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = fd.askdirectory(
            title='Carpeta de descargas',
            initialdir=settings.get('download_folder', str(Path.home() / 'Music')),
        )
        root.destroy()
        return folder or ''

    def open_folder(self, path: str) -> dict:
        """Abre una carpeta en el explorador de Windows."""
        try:
            os.startfile(path)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def scan_library(self) -> list[dict]:
        """Escanea la carpeta de descargas y devuelve metadatos básicos."""
        folder = settings.get(
            'download_folder',
            str(Path.home() / 'Music' / 'MHL Music'),
        )
        tracks = []
        for ext in ('mp3', 'm4a', 'aac', 'flac', 'ogg', 'wav'):
            for p in Path(folder).glob(f'**/*.{ext}'):
                tracks.append({
                    'path': str(p),
                    'filename': p.name,
                    'size': p.stat().st_size,
                })
        return tracks

    # ── yt-dlp info ───────────────────────────────────────────────────────────

    def get_ytdlp_version(self) -> str:
        try:
            r = subprocess.run(
                [_bin('yt-dlp.exe'), '--version'],
                capture_output=True, text=True, timeout=10,
            )
            return r.stdout.strip()
        except Exception:
            return 'desconocido'
