<#
Download latest yt-dlp Android binary and integrate into project assets.
Usage: powershell -ExecutionPolicy Bypass -File scripts/download-and-integrate-yt-dlp.ps1

This script attempts to download a platform-appropriate yt-dlp Android binary
from the official GitHub releases and place it into
`android/app/src/main/assets/yt-dlp`. It is conservative and exits with a
non-zero code on failure so CI/build systems notice.
#>

Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$assetPath   = Join-Path $projectRoot 'android/app/src/main/assets'
$targetFile  = Join-Path $assetPath 'yt-dlp'

$candidates = @(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_arm64',
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_x86_64',
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android_x86',
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_android'
)

Write-Host "[yt-dlp] Target: $targetFile"

if (-not (Test-Path $assetPath)) {
    New-Item -ItemType Directory -Path $assetPath -Force | Out-Null
}

$downloaded = $false
foreach ($url in $candidates) {
    Write-Host "[yt-dlp] Trying: $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $targetFile -UseBasicParsing -ErrorAction Stop
        $downloaded = $true
        Write-Host "[yt-dlp] Downloaded from: $url"
        break
    } catch {
        Write-Warning ("[yt-dlp] Failed to download from {0}: {1}" -f $url, $_)
    }
}

if (-not $downloaded) {
    Write-Error "[yt-dlp] Could not download yt-dlp binary. Please download manually from https://github.com/yt-dlp/yt-dlp/releases/latest and save as $targetFile"
    exit 2
}

# Ensure executable bit on Unix-like systems. Android packaging will use this asset as-is.
if ($env:OS -ne 'Windows_NT') {
    try {
        & chmod +x $targetFile
    } catch {
        Write-Warning ("[yt-dlp] Could not set +x on {0}: {1}" -f $targetFile, $_)
    }
}

Write-Host "[yt-dlp] Placed at: $targetFile"

Write-Host "[yt-dlp] Script finished successfully."
