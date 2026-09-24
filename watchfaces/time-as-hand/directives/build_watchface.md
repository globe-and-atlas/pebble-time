---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Build Time as Hand

## Contract
- Target directive: `directives/build_watchface.md`.
- Execution: `execution/preview.py`, `execution/verify.py`.
- Outputs: native `watchface/`, interactive local preview, `article/field-notes.md`, installable `.pbw` when SDK build succeeds.
- Keep secrets unread. No publishing, git push, or account login. Temporary output stays in `.tmp/`.

## Original specification
The digital time is the rotating hour hand. Its position follows a conventional hour hand, including minutes, once per 12 hours. The face has no permanent hour labels. Only at 3:00, 6:00, 9:00, 12:00 does a single upright corresponding numeral replace the hand at right, bottom, left, top respectively. The dial is otherwise empty. Use the restrained light gridcore concept, black time and amber hand accent. Build a Pebble Time 2 prototype and preserve honest material for an article.

## Explicit v1 interpretation
Minute-resolution updates. Special state lasts the matching minute (seconds 00–59). 12-hour text without AM/PM. Left-side text flips for legibility. No satellite, network, animation timer, or phone dependency in the watchface. Browser preview uses the same C pixel renderer as the watch.

## Validation Contract
- [x] 03:00 renders only upright 3 on the right.
- [x] 06:00 renders only upright 6 at the bottom.
- [x] 09:00 renders only upright 9 on the left.
- [x] 12:00 renders only upright 12 at the top.
- [x] Midnight renders the same face as noon.
- [x] 03:01 renders full 3:01 along the hand.
- [x] 06:15 renders full 6:15 along the hand.
- [x] 03:30 has an hour-hand angle of 105 degrees clockwise from top.
- [x] Exactly eight minutes in a 24-hour day use the single-numeral state.
- [x] Rendering each of the 1,440 minutes stays inside the 200 x 228 display.
- [x] Browser time selection changes the rendered face.
- [x] Browser live mode follows local time.
- [x] Native Emery build produces a PBW.
- [x] Article notes distinguish measured evidence from untested expectations.
- [x] Fresh independent verifier reviews this specification against final output.

## Deferred acceptance
Physical installation, outdoor readability, wrist comfort, battery life and wearer observations require the user's actual watch. Emulator testing does not satisfy those conditions.
