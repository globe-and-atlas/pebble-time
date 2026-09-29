# Agent Instructions: Facet Atlas

Pebble Time 2 (`emery`) watchapp plus PebbleKit JS phone companion. Read README.md, docs/VALIDATION.md and RELEASE.md before changing anything.

## Commands

- `npm --prefix tools/dev ci` once, then `make check` (tests, lint, type checks, preflight). Every change must keep this green.
- `make previews`: host renders for layout checks. Never present them as emulator captures.
- `pebble build`, `pebble install --emulator emery`: the only valid evidence for watch behaviour.
- `node tools/preflight.js --release`: gate for a release.

## Rules specific to this project

- Measured, derived and illustrative data stay distinct in code, UI and docs. Never fabricate a date, datum or resolution; use UNKNOWN.
- C core (`fa_tile`, `fa_xfer`, `fa_render`) stays platform independent and host-tested; Pebble APIs only in `main.c`.
- Tile limits and protocol numbers live in both C and JS; change both, and preflight will check that they match.
- Phone code is ES5 plus Promise (PebbleKit JS runtimes vary); eslint enforces this.
- No real personal locations in fixtures. Public reference points must be added to `PUBLIC_POINTS` in tools/preflight.js with a label.
