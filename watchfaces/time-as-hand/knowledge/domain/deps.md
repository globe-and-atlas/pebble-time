---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Dependencies
Installed `pebble-tool==5.0.40` via `uv tool install pebble-tool` into uv's isolated tool environment. Existing Node v24.14.0, uv and Homebrew libpng available. SDK installation in progress. No runtime AI dependency. Native app uses Pebble C SDK; preview uses Python standard library plus local C compiler.

SDK 4.33.1 installed. Emulator screenshot checks use Pillow 12.3.0 already included in the isolated Pebble CLI environment. Native face uses no npm runtime dependencies.

## 2026-09-23 — Calendar settings
- @rebble/clay 1.1.0 pinned in watchface/package.json and package-lock.json. Bundles offline phone configuration into each PBW; no hosted settings page required.
- Installed via `pebble package install @rebble/clay`; pinned exact version, refreshed lock using `npm install --package-lock-only`.
- Select uses `serializeValueAs: integer` to match the native AppMessage receiver. Source: installed Clay README; https://github.com/pebble-dev/clay.
- Run `pebble clean` after changing messageKeys: this SDK reused the old generated header during an incremental build, causing missing MESSAGE_KEY_* compiler errors.

## 2026-09-23 — numpy (host verification only)
execution/verify_hemisphere.py imports numpy (2.4.2 here) for its over-clearing consensus check across 720 frames. Host-side only; not part of the watch build or phone bundle. Install with `python3 -m pip install numpy` if the import fails.
