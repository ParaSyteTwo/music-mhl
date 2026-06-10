"""Tests for score_candidate() function."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from modules.search import build_candidate_queries, score_candidate


def test_score_rejects_music_video():
    mv_candidate = {
        "title": "Gorillaz - Clint Eastwood (Official Music Video)",
        "channel": "Gorillaz",
        "duration": 340,
        "videoId": "abc123",
    }
    audio_candidate = {
        "title": "Gorillaz - Clint Eastwood (Official Audio)",
        "channel": "Gorillaz - Topic",
        "duration": 340,
        "videoId": "xyz456",
    }
    score_mv = score_candidate(mv_candidate, "Clint Eastwood", "Gorillaz")
    score_audio = score_candidate(audio_candidate, "Clint Eastwood", "Gorillaz")
    assert score_audio > score_mv, f"Audio ({score_audio}) debería superar MV ({score_mv})"
    print(f"PASS test_score_rejects_music_video: audio={score_audio} > mv={score_mv}")


def test_score_prefers_radio_edit():
    radio = {
        "title": "Gorillaz - Feel Good Inc (Radio Edit)",
        "channel": "SomeChannel",
        "duration": 215,
        "videoId": "r1",
    }
    mv = {
        "title": "Gorillaz - Feel Good Inc (Official Video)",
        "channel": "Gorillaz",
        "duration": 215,
        "videoId": "m1",
    }
    score_radio = score_candidate(radio, "Feel Good Inc", "Gorillaz")
    score_mv = score_candidate(mv, "Feel Good Inc", "Gorillaz")
    assert score_radio > score_mv, f"Radio edit ({score_radio}) debería superar MV ({score_mv})"
    print(f"PASS test_score_prefers_radio_edit: radio={score_radio} > mv={score_mv}")


def test_score_album_bonus():
    with_album = {
        "title": "Demon Days - Feel Good Inc",
        "channel": "SomeChannel",
        "duration": 215,
        "videoId": "a1",
    }
    without_album = {
        "title": "Feel Good Inc",
        "channel": "SomeChannel",
        "duration": 215,
        "videoId": "a2",
    }
    score_with = score_candidate(with_album, "Feel Good Inc", "Gorillaz", "Demon Days")
    score_without = score_candidate(without_album, "Feel Good Inc", "Gorillaz", "Demon Days")
    assert score_with > score_without, f"Con álbum ({score_with}) debería superar sin álbum ({score_without})"
    print(f"PASS test_score_album_bonus: with_album={score_with} > without_album={score_without}")


def test_score_rejects_altered_versions():
    official = {
        "title": "Artist - Song (Official Audio)",
        "channel": "Artist - Topic",
        "duration": 180,
        "videoId": "official",
    }
    altered = {
        "title": "Artist - Song sped up remix cover",
        "channel": "Fan Channel",
        "duration": 145,
        "videoId": "altered",
    }
    assert score_candidate(official, "Song", "Artist", "", 180) > score_candidate(
        altered, "Song", "Artist", "", 180
    )


def test_primary_query_is_official_audio_with_fallback():
    queries = build_candidate_queries("Song", "Artist")
    assert queries == ["song artist official audio", "song artist"]


if __name__ == "__main__":
    test_score_rejects_music_video()
    test_score_prefers_radio_edit()
    test_score_album_bonus()
    print("\nAll tests passed!")
