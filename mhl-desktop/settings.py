import json
import os
from pathlib import Path

_custom_dir = os.environ.get('MHL_CONFIG_DIR')
CONFIG_DIR = Path(_custom_dir).resolve() if _custom_dir else Path.home() / '.mhl-music'
CONFIG_FILE = CONFIG_DIR / 'settings.json'

DEFAULTS = {
    'download_folder': str(Path.home() / 'Music' / 'MHL Music'),
}

class Settings:
    def __init__(self):
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        self._data = dict(DEFAULTS)
        try:
            if CONFIG_FILE.exists():
                self._data = {**DEFAULTS, **json.loads(CONFIG_FILE.read_text(encoding='utf-8'))}
        except Exception:
            pass

    def save(self):
        try:
            CONFIG_FILE.write_text(json.dumps(self._data, indent=2), encoding='utf-8')
        except OSError:
            pass

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
        self.save()

settings = Settings()
