import base64
import json
from unittest.mock import MagicMock, patch

from bridge import Bridge, _encode_audio_bytes


def _response(*entries: dict) -> MagicMock:
    return MagicMock(
        returncode=0,
        stderr='',
        stdout='\n'.join(json.dumps(entry) for entry in entries),
    )


def test_youtube_music_is_primary_and_returns_raw_candidates():
    bridge = Bridge()
    response = _response({
        'id': 'song-one', 'title': 'Song', 'channel': 'Artist - Topic',
        'duration': 180, 'artist': 'Artist', 'album': 'Album', 'isrc': 'USAAA2400001',
        'acodec': 'opus', 'abr': 140,
    })

    with patch('bridge.subprocess.run', return_value=response) as run:
        result = bridge.get_candidates({'title': 'Song', 'artist': 'Artist', 'source': 'youtube_music', 'depth': 'deep'})

    args = run.call_args_list[0].args[0]
    assert args[1].startswith('https://music.youtube.com/search?')
    assert args[1].endswith('#songs')
    assert result['success'] is True
    assert result['candidates'][0] == {
        'videoId': 'song-one', 'title': 'Song', 'channel': 'Artist - Topic',
        'duration': 180, 'source': 'youtube_music', 'resultType': 'song',
        'artist': 'Artist', 'album': 'Album', 'isrc': 'USAAA2400001',
        'edition': 'unknown', 'sourceCodec': 'opus', 'sourceAbr': 140,
    }


def test_general_youtube_is_only_used_when_requested_by_frontend():
    bridge = Bridge()
    with patch('bridge.subprocess.run', return_value=_response()) as run:
        bridge.get_candidates({'title': 'Song', 'artist': 'Artist', 'source': 'youtube', 'depth': 'deep'})
    assert run.call_args.args[0][1].startswith('ytsearch8:')


def test_youtube_music_artist_arrays_are_preserved_for_verification():
    bridge = Bridge()
    response = _response({
        'id': 'soul-of-cinder', 'title': 'Soul of Cinder',
        'artists': [{'name': 'Yuka Kitamura'}], 'duration': 352,
    })

    with patch('bridge.subprocess.run', return_value=response):
        result = bridge.get_candidates({
            'title': 'Soul of Cinder', 'artist': 'Yuka Kitamura',
            'source': 'youtube_music', 'depth': 'light',
        })

    candidate = result['candidates'][0]
    assert candidate['artist'] == 'Yuka Kitamura'
    assert candidate['channel'] == 'Yuka Kitamura'


def test_light_search_is_flat_and_bounded_to_three():
    bridge = Bridge()
    with patch('bridge.subprocess.run', return_value=_response()) as run:
        bridge.get_candidates({'title': 'Song', 'artist': 'Artist', 'source': 'youtube_music', 'depth': 'light'})
    args = run.call_args.args[0]
    assert '--flat-playlist' in args
    assert args[args.index('--playlist-end') + 1] == '3'


def test_desktop_audio_contract_uses_real_base64():
    encoded = _encode_audio_bytes(bytes([0, 1, 254, 255]))
    assert encoded == 'AAH+/w=='
    assert base64.b64decode(encoded) == bytes([0, 1, 254, 255])


def test_audio_download_requires_a_resolved_candidate():
    result = Bridge().get_raw_audio(None, 'Song', 'Artist', ['Song Artist'])
    assert result == {'success': False, 'error': 'candidate_invalid: resolved videoId required'}
