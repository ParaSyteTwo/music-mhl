from pathlib import Path


DESKTOP_DIR = Path(__file__).resolve().parents[1]


def test_pyinstaller_spec_uses_official_pythonnet_hooks():
    spec = (DESKTOP_DIR / 'MHLMusic.spec').read_text(encoding='utf-8')

    assert "collect_data_files('pythonnet'" not in spec
    assert 'collect_dynamic_libs' not in spec
    assert "'Python.Runtime.dll'" in spec
    assert "'ClrLoader.dll'" in spec


def test_desktop_requirements_pin_reproducible_versions():
    requirements = (DESKTOP_DIR / 'requirements.txt').read_text(encoding='utf-8')

    for line in requirements.splitlines():
        if line.strip():
            assert '==' in line
    assert 'pythonnet==3.0.5' in requirements
    assert 'clr-loader==0.2.10' in requirements
    assert 'pyinstaller==6.20.0' in requirements


def test_portable_build_script_performs_clean_build_and_smoke_test():
    script = (DESKTOP_DIR / 'scripts' / 'build-portable.ps1').read_text(encoding='utf-8')

    assert 'Remove-Item -LiteralPath $buildDir -Recurse -Force' in script
    assert 'Remove-Item -LiteralPath $desktopDistDir -Recurse -Force' in script
    assert "MainWindowTitle -eq 'MHL Music'" in script
    assert 'Compress-Archive' in script
    assert '"MHL-Music-Portable-$version.zip"' in script


def test_packaging_sources_do_not_pin_developer_machine_paths():
    checked_files = [
        DESKTOP_DIR / 'MHLMusic.spec',
        DESKTOP_DIR / 'launcher.py',
        DESKTOP_DIR / 'bridge.py',
        DESKTOP_DIR / 'settings.py',
        DESKTOP_DIR / 'MHL Music.exe.config',
    ]
    forbidden_fragments = [
        'C:\\Users\\',
        'C:/Users/',
        'AppData\\Local\\Programs',
        'Documents\\programas',
    ]

    for path in checked_files:
        content = path.read_text(encoding='utf-8')
        assert not any(fragment in content for fragment in forbidden_fragments), path


def test_clr_runtime_configuration_exists_and_valid():
    config_path = DESKTOP_DIR / 'MHL Music.exe.config'
    assert config_path.exists()
    content = config_path.read_text(encoding='utf-8')
    assert '<loadFromRemoteSources enabled="true"/>' in content

    spec = (DESKTOP_DIR / 'MHLMusic.spec').read_text(encoding='utf-8')
    assert "'MHL Music.exe.config'" in spec

    script = (DESKTOP_DIR / 'scripts' / 'build-portable.ps1').read_text(encoding='utf-8')
    assert "'MHL Music.exe.config'" in script
