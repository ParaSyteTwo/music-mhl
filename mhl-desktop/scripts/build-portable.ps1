param(
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = 'Stop'

$desktopDir = Split-Path -Parent $PSScriptRoot
$projectDir = Split-Path -Parent $desktopDir
$buildDir = Join-Path $desktopDir 'build'
$desktopDistDir = Join-Path $desktopDir 'dist'
$appDir = Join-Path $desktopDistDir 'MHL Music'
$exePath = Join-Path $appDir 'MHL Music.exe'
$packagePath = Join-Path $projectDir 'package.json'
$releaseDir = Join-Path $projectDir 'release'

if (Test-Path -LiteralPath (Join-Path $desktopDir '.venv\Scripts\python.exe')) {
    $pythonPath = Join-Path $desktopDir '.venv\Scripts\python.exe'
} else {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCmd) {
        throw "Python executable not found in PATH or .venv"
    }
    $pythonPath = $pythonCmd.Source
}

$pythonVersion = & $pythonPath -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$pythonMajor = [int](& $pythonPath -c "import sys; print(sys.version_info.major)")
$pythonMinor = [int](& $pythonPath -c "import sys; print(sys.version_info.minor)")
if ($pythonMajor -ne 3 -or $pythonMinor -lt 11) {
    throw "Desktop portable requires Python 3.11+, found $pythonVersion"
}

if (-not $SkipFrontendBuild) {
    & npm --prefix $projectDir run build
    if ($LASTEXITCODE -ne 0) {
        throw 'Frontend build failed'
    }
}

foreach ($required in @(
    (Join-Path $desktopDir 'assets\yt-dlp.exe'),
    (Join-Path $desktopDir 'assets\ffmpeg.exe'),
    (Join-Path $projectDir 'dist\index.html')
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required build input is missing: $required"
    }
}

if (Test-Path -LiteralPath $buildDir) {
    Remove-Item -LiteralPath $buildDir -Recurse -Force
}
if (Test-Path -LiteralPath $desktopDistDir) {
    Remove-Item -LiteralPath $desktopDistDir -Recurse -Force
}

Push-Location $desktopDir
try {
    & $pythonPath -m pytest -q
    if ($LASTEXITCODE -ne 0) {
        throw 'Desktop tests failed'
    }

    & $pythonPath -m PyInstaller MHLMusic.spec --noconfirm --clean
    if ($LASTEXITCODE -ne 0) {
        throw 'PyInstaller build failed'
    }

    $sourceConfig = Join-Path $desktopDir 'MHL Music.exe.config'
    $targetConfig = Join-Path $appDir 'MHL Music.exe.config'
    if (Test-Path -LiteralPath $sourceConfig) {
        Copy-Item -LiteralPath $sourceConfig -Destination $targetConfig -Force
    }
} finally {
    Pop-Location
}

foreach ($required in @(
    $exePath,
    (Join-Path $appDir 'MHL Music.exe.config'),
    (Join-Path $appDir '_internal\pythonnet\runtime\Python.Runtime.dll'),
    (Join-Path $appDir '_internal\clr_loader\ffi\dlls\amd64\ClrLoader.dll')
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Portable output is incomplete: $required"
    }
}

$process = Start-Process -FilePath $exePath -PassThru -WindowStyle Minimized
$started = $false
try {
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        if ($process.HasExited) {
            throw "Portable smoke test exited with code $($process.ExitCode)"
        }
        if ($process.MainWindowTitle -eq 'MHL Music') {
            $started = $true
            break
        }
    }
    if (-not $started) {
        throw 'Portable smoke test did not open the MHL Music window'
    }
} finally {
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit()
    }
}

$version = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
$zipPath = Join-Path $releaseDir "MHL-Music-Portable-$version.zip"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $appDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Portable verified: $zipPath"
