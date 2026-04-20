import base64
import hashlib
import hmac
import json
from typing import Any

from fastapi import HTTPException, Header

from config import DOWNLOAD_SIGNING_SECRET, SERVICE_API_KEY, TOKEN_TTL_SECONDS
from .utils import utc_now_ts


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')


def b64url_decode(raw: str) -> bytes:
    raw += '=' * (4 - len(raw) % 4)
    return base64.urlsafe_b64decode(raw)


def require_service_key(authorization: str | None) -> None:
    if not SERVICE_API_KEY:
        raise HTTPException(status_code=500, detail="SERVICE_API_KEY not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    if token != SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def sign_payload(payload: dict[str, Any]) -> str:
    payload_json = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    payload_b64 = b64url_encode(payload_json.encode('utf-8'))
    signature = hmac.new(
        DOWNLOAD_SIGNING_SECRET.encode('utf-8'),
        payload_b64.encode('utf-8'),
        hashlib.sha256
    ).digest()
    signature_b64 = b64url_encode(signature)
    return f"{payload_b64}.{signature_b64}"


def verify_token(token: str) -> dict[str, Any]:
    try:
        payload_b64, signature_b64 = token.split('.')
        expected_signature = hmac.new(
            DOWNLOAD_SIGNING_SECRET.encode('utf-8'),
            payload_b64.encode('utf-8'),
            hashlib.sha256
        ).digest()
        expected_signature_b64 = b64url_encode(expected_signature)
        if signature_b64 != expected_signature_b64:
            raise HTTPException(status_code=401, detail="Invalid token signature")

        payload_json = b64url_decode(payload_b64).decode('utf-8')
        payload = json.loads(payload_json)

        if payload.get('expiresAt', 0) < utc_now_ts():
            raise HTTPException(status_code=401, detail="Token expired")

        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def build_token(video_id: str, file_name: str, format_name: str) -> dict[str, Any]:
    payload = {
        "expiresAt": utc_now_ts() + TOKEN_TTL_SECONDS,
        "fileName": file_name,
        "format": format_name,
        "videoId": video_id,
    }
    token = sign_payload(payload)
    return {
        "token": token,
        "expiresAt": payload["expiresAt"],
        "fileName": file_name,
    }
