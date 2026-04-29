# Descarga yt-dlp.exe y ffmpeg.exe (build estatico) para el build de escritorio
$resourcesDir = "resources\win"
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

# yt-dlp
$ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
$ytdlpPath = "$resourcesDir\yt-dlp.exe"
if (-Not (Test-Path $ytdlpPath)) {
    Write-Host "Descargando yt-dlp.exe..."
    Invoke-WebRequest -Uri $ytdlpUrl -OutFile $ytdlpPath
    Write-Host "yt-dlp.exe OK"
} else {
    Write-Host "yt-dlp.exe ya existe, omitiendo..."
}

# ffmpeg build estatico desde gyan.dev (sin DLLs externas)
$ffmpegPath = "$resourcesDir\ffmpeg.exe"
if (Test-Path $ffmpegPath) {
    Remove-Item $ffmpegPath -Force
    Write-Host "ffmpeg.exe anterior eliminado"
}

$ffmpegZip = "$resourcesDir\ffmpeg.zip"
$ffmpegExtract = "$resourcesDir\ffmpeg_tmp"
$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "Descargando ffmpeg estatico desde gyan.dev..."
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip

Write-Host "Extrayendo ffmpeg.exe..."
Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegExtract -Force

$ffmpegBin = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if ($ffmpegBin) {
    Copy-Item -Path $ffmpegBin.FullName -Destination $ffmpegPath
    $sizeMB = [math]::Round((Get-Item $ffmpegPath).Length / 1MB, 1)
    Write-Host "ffmpeg.exe extraido ($sizeMB MB)"
} else {
    Write-Error "No se encontro ffmpeg.exe en el zip"
    exit 1
}

Remove-Item $ffmpegZip -Force
Remove-Item $ffmpegExtract -Recurse -Force

Write-Host "Binarios listos en $resourcesDir"
Get-ChildItem $resourcesDir | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 1)
    Write-Host "  $($_.Name) $mb MB"
}
