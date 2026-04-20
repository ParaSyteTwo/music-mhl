import re
from datetime import datetime, timezone


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def sanitize_filename(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*]', '', value)
    value = re.sub(r'\s+', ' ', value).strip()
    value = value[:200]
    return value or 'track'


def normalize_search_term(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r'[^a-z0-9 ]', '', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def looks_anime_like(title: str, artist: str, album: str = "") -> bool:
    anime_keywords = [
        r'\bop\b', r'\bed\b', r'opening', r'ending', r'theme',
        r'anime', r'ost', r'soundtrack', r'tv size', r'short size'
    ]
    combined = f"{title} {artist} {album}".lower()
    return any(re.search(keyword, combined) for keyword in anime_keywords)


def classify_candidate(candidate: dict) -> str:
    title = candidate.get('title', '').lower()
    uploader = candidate.get('uploader', '').lower()

    if any(kw in title for kw in ['anime', 'opening', 'op ', 'ending', 'ed ', 'ost']):
        return 'anime_op_ed'
    if any(kw in title for kw in ['cover', 'tribute']):
        return 'cover'
    if any(kw in title for kw in ['live', 'concert']):
        return 'live'
    if any(kw in uploader for kw in ['official', 'vevo', 'vevo music']):
        return 'official'
    return 'user_content'


def confidence_from_score(score: int) -> str:
    if score >= 900:
        return "muy_alta"
    if score >= 800:
        return "alta"
    if score >= 700:
        return "media"
    if score >= 600:
        return "baja"
    return "muy_baja"
