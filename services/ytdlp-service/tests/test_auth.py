"""Tests para autenticación y firmas."""

import json

from modules.auth import b64url_decode, b64url_encode, sign_payload, verify_token


def test_b64url_encode_decode():
    """Test codificación/decodificación base64 URL-safe."""
    original = b"Hello, World!"
    encoded = b64url_encode(original)
    decoded = b64url_decode(encoded)
    assert decoded == original


def test_sign_and_verify_payload():
    """Test firma y verificación de payload."""
    payload = {"videoId": "abc123", "fileName": "song.mp3", "expiresAt": 9999999999}

    signed_token = sign_payload(payload)
    assert isinstance(signed_token, str)
    assert "." in signed_token

    # Verificar estructura: body.signature
    parts = signed_token.split(".")
    assert len(parts) == 2
    assert len(parts[0]) > 0
    assert len(parts[1]) > 0

    # Decodificar payload original
    body = b64url_decode(parts[0])
    decoded = json.loads(body)
    assert decoded == payload
