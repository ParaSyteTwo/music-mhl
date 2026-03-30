This script downloads the latest yt-dlp Android binary and integrates it into the Android app assets.

Usage (Windows PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-and-integrate-yt-dlp.ps1
```

What it does:
- Attempts to download common yt-dlp Android asset names from the latest GitHub release.
- Places the binary at `android/app/src/main/assets/yt-dlp`.
- Runs `npm run build`, `npx cap sync android`, and builds the Android release APK.
- Copies the generated APK to the repo root and attempts to install it via `adb` if available.

If automatic download fails, download manually from:
https://github.com/yt-dlp/yt-dlp/releases/latest
and place the file as `android/app/src/main/assets/yt-dlp`.
