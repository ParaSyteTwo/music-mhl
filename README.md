# MHL Music

## Your music. No limits.

MHL Music is an open-source application for searching, previewing, downloading, and organizing music. It shares a React interface across Android, Windows, and the Web, with no required accounts, ads, or tracking.

**[Download for Android](../../releases/latest)** | **[Download for Windows](../../releases/latest)**

[![Latest Release](https://img.shields.io/github/v/release/ParaSyteTwo/music-mhl?label=version&color=C8F04B)](../../releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Features

- Fast music search with request caching, deduplication, and stale-result protection.
- A focused download picker with the three best unique candidates.
- Candidate ranking based on title, artist, album, official channel, duration, and ISRC when available.
- Strong filtering against covers, live recordings, remixes, altered-speed versions, instrumentals, and incorrect durations.
- Audio downloads powered by `yt-dlp` and converted with `ffmpeg`.
- Automatic ID3 metadata for downloaded files.
- Synchronized lyrics with original text, romanization, and translation.
- Local library organized by albums, artists, and genres.
- Search history and personalized suggestions.
- Support for opening songs in compatible external players.
- Complete Spanish and English interface with automatic device-language detection and manual selection.

---

## Performance

MHL Music 1.3.5 improves responsiveness without reducing audio quality, metadata accuracy, lyrics, or stability:

- The most promising candidate query runs first; additional queries only run when confidence is insufficient.
- Picker prefetching is reused when the picker opens, avoiding duplicate requests.
- Search and candidate requests share bounded caches and reuse requests already in progress.
- Audio, metadata, and lyrics start in parallel whenever the platform allows it.
- Download concurrency remains capped at two to protect memory and system responsiveness.
- Android candidate searches adapt between two and four workers depending on device resources.
- Reduced animations and lazy-loaded artwork improve behavior on lower-end devices.
- Windows and Android have no artificial delay between queued downloads.
- Web/PWA keeps a protective delay because it depends on shared remote infrastructure.

---

## Platforms

| Platform | Technology | Distribution | Status |
|---|---|---|---|
| Windows 10/11 x64 | React + pywebview | Portable ZIP | Recommended |
| Android 7.0+ | React + Capacitor | APK | Recommended |
| Web / PWA | React + external backend | Browser | Limited availability |

### Windows Desktop

The desktop edition is self-contained. It bundles embedded Python, pywebview, `yt-dlp.exe`, and `ffmpeg.exe`, so it does not require installation, Node.js, Python, or administrator privileges.

Desktop processing is local and never calls the Web/Fly.io download backend.

### Android

The Android application uses Capacitor and a native bridge for downloading audio, accessing the local library, and opening songs with installed players. Candidate lookup and download preparation are tuned for both lower-end and high-performance devices.

### Web / PWA

The Web edition depends on external services. Some functions may be unavailable while the backend is offline, and protective rate limiting remains enabled.

---

## Installation

### Windows

1. Download `MHL-Music-Portable-X.X.X.zip` from [Releases](../../releases/latest).
2. Extract the ZIP file.
3. Run `MHL Music.exe`.

### Android

1. Download `MHL-Music-X.X.X.apk` from [Releases](../../releases/latest).
2. Open the file on your phone.
3. Allow installation from that source if Android requests permission.

---

## Lyrics

MHL Music can combine three lyric layers:

- **Original:** lyrics in the song's original writing system.
- **Romanization:** conversion of scripts such as Japanese, Korean, or Chinese into Latin characters.
- **Translation:** Spanish or English according to the application's active language.

Each layer can be enabled independently. When the original language matches the selected language, the application avoids unnecessary translation. Synchronized lyrics can also be saved as `.lrc` files.

---

## Architecture

| Layer | Technology |
|---|---|
| Interface | React 18 + Vite + TypeScript |
| State | Zustand |
| Android | Capacitor |
| Windows | pywebview + PyInstaller |
| Web backend | FastAPI |
| Tests | Vitest + pytest |

```text
music-mhl/
|-- src/                         # Shared frontend
|   |-- components/             # Interface components
|   |-- lib/                    # APIs, platform, language, and lyrics
|   |-- pages/                  # Search, library, downloads, and settings
|   `-- store/                  # Global Zustand state
|-- android/                    # Capacitor Android project
|-- mhl-desktop/                # Windows pywebview application
|-- services/ytdlp-service/     # Web/PWA backend
`-- release/                    # Local build artifacts
```

### Windows flow

```text
Search   -> Deezer API
Audio    -> yt-dlp.exe
Process  -> ffmpeg.exe
Output   -> MP3 with metadata and optional LRC lyrics
```

---

## Development

### Frontend

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```

### Windows

```bash
cd mhl-desktop
python -m pytest
python -m PyInstaller MHLMusic.spec --noconfirm
```

### Android

```bash
npx cap sync android
cd android
gradlew assembleRelease
```

---

## Privacy

- No mandatory registration.
- No user accounts.
- No ads or tracking.
- Windows and Android process audio locally.
- Open-source and auditable.

---

## Author

**Paul Antonio Diaz Talica**

[paul-dev.vercel.app](https://paul-dev.vercel.app)

Found a problem? Open an [issue](../../issues).
