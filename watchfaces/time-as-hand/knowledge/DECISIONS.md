---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Decisions

## Initial Decision

- Template profile: `dashboard-static`
- Deploy target: `local-only`
- Runtime: `static`

## 2026-09-23 — Portable native renderer
Use one C renderer for preview and native Emery target. Rejected separate browser drawing implementation because it could hide native geometry bugs. Chose minute-resolution updates, 12-hour text, one-minute cardinal state and left-side text flip. Hardware acceptance remains separate.

## 2026-09-23 — Editions and personalization
- Keep distinct UUIDs for Original and Two Hands so each can coexist and retain settings independently.
- Twelve original 5×7 numeral glyph sets preserve layout bounds; date uses a consistent small typeface. No external font assets.
- Hand styling retains optical defaults, supports eight Pebble-native foreground colors and explicit widths1–5. Time labels stay black.
- Bundle Clay1.1.0 configuration rather than hosting a settings page. Browser preferences demonstrate the feature but do not mutate PBWs.
- Use developer dashboard uploads of explicit PBWs for first store release; CLI publish rebuilds the default source edition.

## 2026-09-23 — Hemisphere third edition
User selected concept06 with night/day shading. Keep existing editions separate; add G&A Meridian with its own UUID. Use a bundled low-resolution land mask plus an analytic shadow instead of cached rotation images or network imagery. UTC drives sunlight; the watch OS drives local civil time. Optional phone coordinates affect the camera only. Retain native location when an empty phone sandbox reconnects. See domain/hemisphere.md for sources and limitations.

## 2026-09-23 — Detect Hemisphere by its settings, not a heading
- Decision: pkjs/index.js enables Meridian location logic when the generated Clay config contains a `LocationPreset` item (searched recursively), instead of comparing the first heading text.
- Alternatives: extra `meridian` flag in config (unknown Clay props are unverified); read the manifest (not available to PebbleKit JS).
- Reason: the presence of location settings is exactly what the logic depends on; renaming a heading can no longer disable it. Tested against real generated configs for all three editions.

## 2026-09-23 — Glyph-shaped halo instead of rectangular label block
- Decision: clear the globe within r=numeral scale of each stroke; keep the existing rectangular clearance for hands.
- Alternatives: radius 1 or 2 fixed (too thin / speckled counters); tighter hand gap (would change Two Hands output and let hands enter glyph gaps for ~1 px gain — the gap is already ~2 px, so left alone).
- Reason: the solid white block cut a square hole in the globe; the halo keeps numbers legible while showing the globe up to the letterforms.

## 2026-09-23 — Device-safe rendering and math
Reuse a single 8-bit bitmap as renderer buffer, convert indices only after rendering completes, and gate drawing on readiness. Split globe work into two-row timer callbacks; requests replace unfinished frames. Two measured native fault addresses identified unsafe SDK sqrt and trigonometric reducer loads; replace their internal symbols with numerically verified pointer-free routines. Synchronous host API remains for reference and preview. Emulator-only success is insufficient: final physical completion is still pending.

## 2026-09-23 — Stronger default globe contrast
Wearer found the functioning globe too faint. Darken only globe palette indices:170-gray to85-gray and85-gray toblack. Keep geometry, glyph halos and configured hand/date colors intact. Actual device capture verified the darker result; comfort/readability remains subject to wearer feedback.
