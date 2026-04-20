"""Tests para funciones utilidad."""

from modules.utils import normalize_search_term, sanitize_filename, looks_anime_like


def test_normalize_search_term():
    """Test normalización de términos de búsqueda."""
    assert normalize_search_term("The Beatles - Yellow Submarine") == "the beatles yellow submarine"
    assert normalize_search_term("Song (Remix)") == "song remix"
    assert normalize_search_term("Artist [feat. Someone]") == "artist feat someone"
    assert normalize_search_term("Title ft. Artist") == "title ft artist"


def test_sanitize_filename():
    """Test limpieza de nombres de archivo."""
    assert sanitize_filename("Artist - Song.mp3") == "Artist - Song.mp3"
    assert sanitize_filename("Invalid:Name<>?.txt") == "InvalidName.txt"
    assert sanitize_filename("Multiple  Spaces") == "Multiple Spaces"
    assert len(sanitize_filename("x" * 200)) <= 200


def test_looks_anime_like():
    """Test detección de anime."""
    assert looks_anime_like("Opening 1", "Anime Title", "OST")
    assert looks_anime_like("ED Theme", "Show", "Ending Theme")
    assert not looks_anime_like("Normal Song", "Normal Artist")
