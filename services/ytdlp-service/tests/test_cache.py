"""Tests para el caché LRU."""

from modules.cache import cache_get, cache_key, cache_set


def test_cache_key():
    """Test generación de clave de caché."""
    key1 = cache_key("The Beatles", "Yellow Submarine")
    key2 = cache_key("the beatles", "yellow submarine")
    assert key1 == key2  # Debe ser normalizado


def test_cache_set_and_get():
    """Test almacenamiento y recuperación en caché."""
    key = cache_key("Test Song", "Test Artist")
    candidate = {"title": "Test Song", "duration": 180}

    cache_set(key, "video123", candidate)
    cached = cache_get(key)

    assert cached is not None
    assert cached["videoId"] == "video123"
    assert cached["title"] == "Test Song"
    assert cached["duration"] == 180


def test_cache_get_nonexistent():
    """Test recuperación de clave inexistente."""
    key = cache_key("Nonexistent", "Song")
    cached = cache_get(key)
    assert cached is None
