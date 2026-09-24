---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-24T12:30:05.953903+00:00"
---
# Import watchface projects

Execution: `python3 execution/import_watchfaces.py`. Destination: watchfaces/time-as-hand. Preserve source folder. No credentials, dependencies or generated builds imported.

## Validation contract
- Imported files match source hashes.
- Git origin is globe-and-atlas/pebble-time.
- Watchapps directory exists.
- Five watchface sources are included.
- Ignored artifacts are absent from staged files.
- Focused renderer tests pass in new location.

## Learnings
### 2026-09-24 — superseded by one repository per project
CloudPebble imports a single Pebble project per GitHub repository, so the monorepo layout was replaced. Time as Hand became globe-and-atlas/time-at-hand, with CloudPebble fixes (.inc → .h, a TAH_EDITION fallback), and Personal Atlas is globe-and-atlas/personal-atlas. This repository is now an index; `execution/import_watchfaces.py` is kept for history and should not be re-run.
