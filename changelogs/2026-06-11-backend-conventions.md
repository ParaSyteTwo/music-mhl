# Changelog

> Operational log of structural / convention-level changes that touch
> multiple files. NOT for product release notes — those go in
> `CHANGELOG.md` at the repo root.

## 2026-06-11 — Backend conventions captured (anime feature, Slice 1)

- **New topic file:** `docs/backend-conventions.md`. Captures the
  canonical `routes/*.py` skeleton, the `check_rate_limit` 1-arg
  signature (no `scope`), the `httpx`-only HTTP client rule, and the
  test patterns that future slices need to follow (TestClient + global
  error handler, the `monkeypatch.setattr` fixture style, the
  `patch.object(httpx_module, "AsyncClient", ...)` mock pattern).
- **Bug discovered and fixed in slice 1:** `routes/anime.py` was
  calling `check_rate_limit(ip, "anime")` with a 2-arg signature that
  does not match the real `modules/rate_limit.py` (1-arg). Old
  `allow_request` fixture patched `check_rate_limit` with a 2-arg
  lambda, silently accepting both shapes — CI never caught the
  mismatch. **Lesson:** for any function under test, include at least
  one test that calls the **real** function and asserts a visible
  side effect. Permissive mocks are a class of bug, not a one-off.
- **Cross-worktree `__pycache__` staleness** causes the `Read` tool
  to show a different module than the on-disk truth. Clear it with
  the one-liner documented in `docs/backend-conventions.md` if a
  test fails on a signature that the source file does not have.
- **Reference routes:** `routes/download.py:71-79` (canonical rate
  limit pattern), `routes/search.py:31-46` (canonical auth + search
  shape), `routes/deezer.py:12` (canonical httpx usage).
- See `deliverable.md` under `outputs/anime-backend/` for the slice
  task record (commits `0e96b0a` + `287f72f`, branch
  `feature/anime-backend`).
