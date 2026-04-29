import json
from pathlib import Path

CONFIG_DIR = Path.home() / '.mhl-music'
CONFIG_FILE = CONFIG_DIR / 'settings.json'

DEFAULTS = {
    'format': 'mp3',
    'quality': '0',
    'download_folder': str(Path.home() / 'Music' / 'MHL Music'),
}

class Settings:
    def __init__(self):
        CONFIG_DIR.mkdir(exist_ok=True)
        self._data = dict(DEFAULTS)
        if CONFIG_FILE.exists():
            try:
                self._data = {**DEFAULTS, **json.loads(CONFIG_FILE.read_text(encoding='utf-8'))}
            except Exception:
                pass

    def save(self):
        CONFIG_FILE.write_text(json.dumps(self._data, indent=2), encoding='utf-8')

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
        self.save()

settings = Settings()
