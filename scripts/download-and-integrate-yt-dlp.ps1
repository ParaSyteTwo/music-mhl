# Download latest yt-dlp Android binary and integrate into project
# Usage: powershell -ExecutionPolicy Bypass -File scripts/download-and-integrate-yt-dlp.ps1

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$assetPath = Join-Path $projectRoot "android/app/src/main/assets"
$targetFile = Join-Path $assetPath "yt-dlp"

# Candidate filenames (GitHub release assets commonly use these names)
$candidates = @(
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android",
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_arm64",
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_x86",
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_x86_64"
)

Write-Host "Will try to download yt-dlp to $targetFile"

if (-not (Test-Path $assetPath)) {
    New-Item -ItemType Directory -Path $assetPath -Force | Out-Null
}

$downloaded = $false
foreach ($url in $candidates) {
    Write-Host "Trying: $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $targetFile -UseBasicParsing -ErrorAction Stop
        $downloaded = $true
        Write-Host "Downloaded from: $url"
        break
    } catch {
        Write-Host "Failed: $url`n  $_"
    }
}

if (-not $downloaded) {
    Write-Error "Could not download yt-dlp. Please download manually from https://github.com/yt-dlp/yt-dlp/releases/latest and save as $targetFile"
    exit 2
}

# Ensure executable bit when packaged (Android runtime will set perms on install)
# On Windows, just keep file. On Unix, set +x
if ($IsLinux -or $IsMacOS) {
    chmod +x $targetFile
}

Write-Host "yt-dlp placed at: $targetFile"

# Build + install steps (optional)
Write-Host "Starting build: npm run build && npx cap sync android && cd android && ./gradlew assembleRelease"

cd $projectRoot
npm run build
npx cap sync android
Push-Location (Join-Path $projectRoot 'android')
try {
    if ($IsWindows) {
        & .\gradlew assembleRelease
    } else {
        & ./gradlew assembleRelease
    }
} finally {
    Pop-Location
}

# Copy APK and install via adb if available
$apkSrc = Join-Path $projectRoot "android/app/build/outputs/apk/release/app-release.apk"
$apkDst = Join-Path $projectRoot "MHL Music v1.2.1.apk"
if (Test-Path $apkSrc) {
    Copy-Item $apkSrc $apkDst -Force
    Write-Host "APK copied to $apkDst"
    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if ($null -ne $adb) {
        Write-Host "Installing via adb..."
        & $adb.Source install -r $apkDst
    } else {
        Write-Host "adb not found in PATH — install manually: adb install -r \"$apkDst\""
    }
} else {
    Write-Warning "APK not found at $apkSrc — build may have failed"
}

Write-Host "Done."
