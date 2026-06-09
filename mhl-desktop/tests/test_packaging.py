from pathlib import Path


DESKTOP_DIR = Path(__file__).resolve().parents[1]


def test_pyinstaller_spec_bundles_pythonnet_runtime():
    spec = (DESKTOP_DIR / 'MHLMusic.spec').read_text(encoding='utf-8')

    assert "collect_data_files('pythonnet'" in spec
    assert "runtime/*.dll" in spec
    assert "'pythonnet'" in spec
    assert 'CLR_LOADER_BINARIES' in spec


def test_desktop_requirements_pin_winforms_runtime_dependencies():
    requirements = (DESKTOP_DIR / 'requirements.txt').read_text(encoding='utf-8')

    assert 'pythonnet>=' in requirements
    assert 'clr-loader>=' in requirements


def test_packaging_sources_do_not_pin_developer_machine_paths():
    checked_files = [
        DESKTOP_DIR / 'MHLMusic.spec',
        DESKTOP_DIR / 'launcher.py',
        DESKTOP_DIR / 'bridge.py',
        DESKTOP_DIR / 'settings.py',
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
