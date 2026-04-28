# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec para MHL Music Desktop (pywebview).
Ejecutar desde mhl-desktop/:
    pyinstaller MHLMusic.spec --noconfirm
El .exe resultante estará en dist/MHL Music/MHL Music.exe
"""
import sys
from pathlib import Path

ROOT = Path(SPECPATH)          # mhl-desktop/
DIST  = ROOT.parent / 'dist'  # ../dist  (React build)

block_cipher = None

a = Analysis(
    [str(ROOT / 'launcher.py')],
    pathex=[str(ROOT)],
    binaries=[
        # yt-dlp y ffmpeg bundleados
        (str(ROOT / 'assets' / 'yt-dlp.exe'), 'assets'),
        (str(ROOT / 'assets' / 'ffmpeg.exe'), 'assets'),
    ],
    datas=[
        # React build completo
        (str(DIST), 'dist'),
        # Ícono (embebido en el exe por PyInstaller, también disponible en assets/)
        (str(ROOT / 'assets' / 'icon.ico'), 'assets'),
    ],
    hiddenimports=[
        'webview',
        'webview.platforms.winforms',
        'clr',
        'requests',
        'tkinter',
        'tkinter.filedialog',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'scipy', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='MHL Music',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # sin ventana de consola
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ROOT / 'assets' / 'icon.ico') if (ROOT / 'assets' / 'icon.ico').exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='MHL Music',
)
