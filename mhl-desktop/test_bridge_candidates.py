from bridge import Bridge


def _candidate(video_id: str, score: int) -> dict:
    return {
        "videoId": video_id,
        "title": f"Artist - Song {video_id}",
        "channel": "Artist - Topic",
        "duration": 180,
        "test_score": score,
    }


def test_primary_candidates_skip_extra_queries_and_limit_to_three():
    bridge = Bridge()
    calls: list[str] = []

    def search(query: str, _limit: int) -> list[dict]:
        calls.append(query)
        return [
            _candidate("one", 180),
            _candidate("two", 170),
            _candidate("three", 160),
            _candidate("four", 150),
        ]

    bridge._yt_search_fast = search
    bridge._score_smart = lambda candidate, *_args: candidate["test_score"]
    bridge._label_fast = lambda _candidate: "song"

    result = bridge.get_candidates({
        "title": "Song",
        "artist": "Artist",
        "album": "Album",
        "duration": 180,
    })

    assert len(calls) == 1
    assert [item["videoId"] for item in result["candidates"]] == ["one", "two", "three"]


def test_weak_primary_candidates_expand_search():
    bridge = Bridge()
    calls: list[str] = []

    def search(query: str, _limit: int) -> list[dict]:
        calls.append(query)
        if len(calls) == 1:
            return [_candidate("weak", 80)]
        return [_candidate(f"extra-{len(calls)}", 140)]

    bridge._yt_search_fast = search
    bridge._score_smart = lambda candidate, *_args: candidate["test_score"]
    bridge._label_fast = lambda _candidate: "song"

    result = bridge.get_candidates({
        "title": "Song",
        "artist": "Artist",
        "album": "Album",
        "duration": 180,
    })

    assert len(calls) > 1
    assert len(result["candidates"]) <= 3
