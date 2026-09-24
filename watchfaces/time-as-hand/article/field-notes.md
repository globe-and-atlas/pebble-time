---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Time as Hand — article evidence kit

Status: working experiment; not a completed wear-test article. No originality claim.

## Working title
**When the time becomes the hand**

## Editorial premise
What changes when a familiar display encodes the same information in two ways? Position supplies an approximate hour; the digits supply exact time. Four times per twelve hours the interface reduces to a single upright numeral. Use a small, testable object to examine how AI-assisted making still depends on precise human intent.

For G&A, the connection is visual encoding: a position on a dial carries meaning, just as position on a map does. This is a maker essay about representation and attention. The watch has no geographic feature; do not manufacture a remote-sensing claim to justify the venue.

## Verified design history from this conversation
- Started with geographic watchfaces and satellite cloud imagery.
- Shifted to a digital time string acting as an analog hand.
- AI interpreted the rotation as once per hour. User ultimately specified once per twelve hours.
- AI confused four selected-hour numeral states with quarter-hour simplification, then with permanent dial labels. User corrected both.
- Accepted behavior: 3:00 -> upright 3 at right; 6:00 -> upright 6 below; 9:00 -> upright 9 at left; 12:00 -> upright 12 above. Otherwise full time along the hour hand. No permanent labels.
- Implementation assumption stated explicitly: special state lasts the entire matching minute. First wearable prototype updates each minute.

## Article structure
1. Lead with two actual screenshots: 3:00 and 3:01. Explain the visual transition.
2. Describe the intent and the repeated AI misinterpretations. Attractive output did not prove shared understanding.
3. Show the exact specification that finally fixed the ambiguity.
4. Show source -> compiled watchface -> emulator. Distinguish concept art from measured output.
5. Report the wear test only after doing it. Can the wearer read 11:59? Does the sideways text require wrist rotation? Is the isolated 3 intuitive?
6. Conclude from the observed result, including abandonment if it fails. No generic claim that AI democratized everything.

## Draft opening (proposed copy, not a claim of physical testing)
At three o'clock, the watch face contains a single 3. It sits on the right, where a clock has taught us to look for it. One minute later, it becomes 3:01, written along a hand that will take twelve hours to travel around the face.

The idea was simple to picture and surprisingly easy to describe incorrectly. During the design conversation, the AI produced a minute hand, a face with permanent hour markers, and a face that substituted the same digit at every quarter hour. Each was a plausible interpretation. None was the intended watch.

That gap became the useful part of the experiment. A rendered image could suggest the object. It could not specify what the object should do at 2:59, 3:00 and 3:01. The transition needed an explicit rule before it could become code.

## Human observations still needed
- First reading of the real watch without consulting another clock.
- Legibility at morning, afternoon and evening angles.
- What 3:00 communicates without prior explanation.
- Whether minute-stepped movement feels right.
- Measured battery experience against a comparable simple face; do not infer savings from update frequency alone.
- Whether the design still feels worth wearing after several days.

## Evidence rules
Use `.tmp/verification.json` for automated scope. Use `.tmp/emulator-verification.json` only after it exists and passes. `.tmp/emulator-*.png` are emulator screenshots, not wrist photos. Generated conversation renders are illustrative concepts. Do not claim live-device acceptance, battery life, novelty, publishing or installation until observed.

## Sources
- [Current Pebble SDK setup](https://developer.repebble.com/sdk/)
- [Pebble drawing API](https://developer.repebble.com/docs/c/Graphics/Draw_Commands/)
- Source of design decisions: this conversation, 2026-09-23.

## Stop rule
Give the first physical trial one focused session. If exact time remains difficult to read, test a larger label or a less radial layout before expanding scope. Leave settings, store distribution and extra complications out of this experiment.

## 2026-09-23 observed results
- 1,440 host minute states passed label, angle, buffer and margin checks.
- Eight explicit fixed-time native emulator builds matched the host renderer with zero differing pixels.
- Final restored live emulator screenshot matched local time at 07:47.
- Independent verifier approved the final implementation and matched preview download to build SHA-256.
- Physical watch has not been installed or worn in this session.

## 2026-09-23 — User-requested variants and controls
The user added a second edition with upright hour and minute labels at different radii, then date placement and typography/hand controls. This explicitly expands the earlier stop rule's no-settings scope. It does not justify postponing a physical trial for more options.

The useful article comparison is now Original versus Two Hands: does rotating the whole time string offer anything over keeping two numbers upright? Twelve original pixel numeral designs make typography testable, but a dropdown is not evidence that reading improves. Settings include eight hand colors, five widths, and sixteen date-field combinations at either edge. Defaults preserve the original design.

New host evidence: 17,280 styled time states; 5,920 date-format cases; separate per-edition browser preference persistence; independent reviewers approved renderer, controls and bundled phone configuration. See .tmp/calendar-emulator-verification.json for the final native comparison result when present. Physical settings UI, wrist readability and battery still need actual-device checks. Store steps are in PUBLISH.md; nothing has been published.

Final native extension evidence: .tmp/calendar-emulator-verification.json contains 17 successful comparisons with zero differing pixels, including both-edition settings persistence and final production live clock. Three verified native screenshots per edition copied to assets/store/. These remain emulator evidence.

## 2026-09-23 — Meridian / Hemisphere
The user selected concept 06: a globe behind two numbered hands, with shaded night and day. This is the third edition. Its G&A tie-in is geographic time: the watch shows the civil time where you are, while the world beneath it follows the Sun.

The design separates three things that are easy to confuse: UTC determines illumination; the watch's local clock determines hands/date; location determines which hemisphere is visible. DST shifts the civil clock, not the Sun. The globe uses bundled Natural Earth land and a calculated shadow, not cached rotation pictures, live clouds, or a weather service. A remembered location makes the face useful offline.

Useful article evidence: the desktop renderer initially looked correct while the native Pebble build crashed. Native atan2f returned invalid projected longitudes; a small bounded approximation repaired it. Pixel comparison then exposed a disagreement between emulator civil time and its UTC clock. The installed CLI rewrites time-zone settings on each connection, while Emery follows a host RTC; the final native fixture uses an explicit UTC process environment. Host DST checks and physical non-UTC testing are separate evidence. These are specific examples of why AI-generated code still needs device-level checks, not a story about effortless implementation.

Evidence files: `.tmp/hemisphere-verification.json` (seasonal, DST and label-clearance tests), `.tmp/hemisphere-emulator-verification.json` (native comparison results when present), and `execution/verify_location.js` (mock phone-location flow). Browser checks exercised London, saved preferences, a bottom date line and the spring DST gap. None establish battery life or physical wrist readability.

Article test: wear Original, Two Hands and Hemisphere for comparable periods. Does the globe communicate day/night usefully, or merely look appealing? A short measured answer is stronger than another round of features. Treat the third edition as the last planned expansion before that trial.
