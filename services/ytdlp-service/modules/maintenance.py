from datetime import datetime, timezone
from threading import Lock

_maintenance_lock = Lock()
_maintenance_mode = False
_maintenance_until: float = 0.0


def set_maintenance(active: bool, minutes: int = 5) -> None:
    """Activa/desactiva modo mantenimiento por N minutos."""
    global _maintenance_mode, _maintenance_until
    with _maintenance_lock:
        _maintenance_mode = active
        _maintenance_until = (
            datetime.now(timezone.utc).timestamp() + minutes * 60
        ) if active else 0.0


def is_maintenance() -> bool:
    """Devuelve True si el servicio está en mantenimiento."""
    global _maintenance_mode
    with _maintenance_lock:
        if not _maintenance_mode:
            return False
        if datetime.now(timezone.utc).timestamp() > _maintenance_until:
            _maintenance_mode = False
            return False
        return True


def get_maintenance_until() -> float:
    """Devuelve timestamp hasta el cual el mantenimiento está activo."""
    with _maintenance_lock:
        return _maintenance_until if _maintenance_mode else 0.0
