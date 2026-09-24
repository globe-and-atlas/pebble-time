---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Add two-hand edition

## User specification
Add another edition with the hour number at or near the hour-hand end and minute number at or near the minute-hand end. Preserve the existing edition.

## Design
Two upright numeric labels: 12-hour hour without leading zero, two-digit minute including 00. Short black hour hand follows hours plus fractional minutes; longer amber minute hand follows minutes. Labels placed on separate radial tracks avoid overlap. Both labels remain present at cardinal hours in this edition. Same minute cadence. Two separately installable PBWs with distinct UUIDs.

## Contract
- Directive: directives/add_edition.md.
- Execution scripts: execution/build_editions.py, execution/verify_editions.py, execution/preview.py.
- Artifacts: two native PBWs in dist/, preview edition selector, updated article field notes.
- Safety: no secrets read; no publication or push; transient evidence in .tmp/.

## Validation
- [x] Original edition pixels match pre-change baseline for 720 distinct minutes.
- [x] New hour label uses 1–12.
- [x] New minute label uses 00–59.
- [x] At 3:30, hour direction is 105 degrees clockwise from top.
- [x] At 3:30, minute direction is 180 degrees clockwise from top.
- [x] New numeric labels remain upright for 720 distinct minutes.
- [x] Label rectangles have no overlap for 720 distinct minutes.
- [x] New display has a clear three-pixel edge margin for 720 distinct minutes.
- [x] Preview selector changes renderer edition.
- [x] Time controls work with each edition.
- [x] Each edition has its own PBW download.
- [x] The two native bundles use different UUIDs.
- [x] New-edition native fixture captures match preview pixels.
- [x] A fresh verifier approves final changes.

## Pending hardware acceptance
Readability and battery remain physical-watch tests.
