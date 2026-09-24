---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Add typography and hand styling

User request: 12 Pebble-optimized fonts across retro, modern and classic styles; customizable hand colors and widths.

## Contract
- Target: directives/add_typography.md; preserve directives/add_calendar.md.
- Execution: execution/generate_fonts.py, execution/verify_styles.py, execution/build_editions.py, execution/check_calendar_emulator.py.
- Outputs: preview at port 4286; two updated PBWs in dist/; evidence in .tmp/.
- Safety: local-only; no secrets; no publishing.

## Product decisions
Twelve original pixel numeral designs, grouped into Pixel, Retro, Modern, Classic. These are compact custom glyph sets, not licensed commercial font reproductions. They change time numerals; the date keeps its consistent small pixel font. A shared 5×7 cell protects time-label fit. Hand colors use a selected high-contrast Pebble palette. Widths 1–5 pixels. Original has one hand; Two Hands has separate hour/minute controls. Defaults preserve existing pixels. Each edition remembers preferences.

## Validation
- [x] Twelve distinct digit glyph sets are available in the preview.
- [x] Twelve distinct digit glyph sets are available in phone settings.
- [x] Both editions render each font without clipping over 720 distinct minutes.
- [x] Default styling preserves existing baseline pixels.
- [x] Original hand color changes without recoloring numerals.
- [x] Hour hand color can differ from minute hand color.
- [x] Each hand supports widths 1–5.
- [x] Date rendering remains unchanged by time-font choice.
- [x] Preview styling preferences survive reload per edition.
- [x] Watch styling preferences survive app restart.
- [x] Native styled fixtures match the shared renderer.
- [x] Both production PBWs include style settings.
- [x] A fresh independent verifier approves.
