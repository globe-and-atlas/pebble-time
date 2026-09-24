---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# When the time becomes the hand

*Working G&A draft — prototype verified in software; physical wear test still pending.*

At three o'clock, the watch face contains a single 3. It sits on the right, where a clock has taught us to look for it. One minute later, it becomes 3:01, written along a hand that will take twelve hours to travel around the face.

At six, the hand disappears into an upright 6 at the bottom. At nine, a 9 on the left. At twelve, a 12 above. For the rest of the day, the digits travel with the hand.

This is the small object at the center of the experiment: a watch that uses the position of time and the spelling of time together.

## The attractive wrong answer

The design began as a conversation with AI. There were globe faces, satellite clouds, grids and contact sheets. The more interesting idea emerged when the map disappeared: could the digital time itself become the analog hand?

The answer depended on a distinction that the first renders kept missing. A hand could circle the face every minute, every hour or every twelve hours. A numeral could be a permanent label, a replacement for the hand, or a marker at its tip. All of those interpretations could produce a convincing picture.

The conversation went through several of them. At one point, the proposed face displayed the same hour digit at every quarter hour. Another version put 12, 3, 6 and 9 permanently around the edge. The intended behavior was different: a single upright numeral only when the time reached that named hour.

A useful specification eventually replaced the ambiguity. At 3:00, show 3 on the right. At 3:01, restore the full digital time. At 3:30, the hand sits halfway between three and four. The position follows an hour hand, including its fractional movement through the hour.

The distinction matters beyond watches. In a map, a mark's position and its label have separate jobs. Here they do too. The digits give an exact reading; the angle provides a familiar spatial cue. Whether the combination is comfortable to read is a question for the wearer.

## From rendering to behavior

The prototype targets the Pebble Time 2. It uses a white field, black pixel lettering and an amber line. There are no permanent hour markers. During the four named-hour states, the pivot and amber line disappear as well, leaving just the numeral.

The first version updates once per minute. The special numeral stays for the named minute rather than flashing for a single second. That is an implementation choice, and it needs to earn its place in the physical trial.

The watch and the browser preview share the same C drawing code. A slider lets the design be inspected throughout twelve hours, including the less flattering angles. The lettering reverses its reading direction on the left half so that it does not spend six hours upside down. Near the vertical positions it is still sideways. That compromise is visible in the prototype.

Automated checks exercised 1,440 minutes, including the eight special minutes in a full day. They checked labels, angles and image boundaries. Eight selected native emulator states were compared with the preview pixel for pixel. A separate check tests the final live-clock build.

Those checks establish behavior. They do not establish that this is a good watch.

## The part the prototype cannot answer

The next useful evidence is a glance at an actual wrist. Does the time read quickly at 11:59? Is a solitary 3 understandable before the mechanism has been explained? Does the minute-by-minute motion feel deliberate, or does the hand look stuck?

Battery life also needs measurement. A simple update schedule is a design choice, not a battery result.

For now, the object has passed a narrower test: it does what the final specification says in the software checks performed. The important contribution of AI was helping turn a visual idea into something inspectable. Its repeated misreadings are part of the record too. The design became more precise because the human kept correcting the behavior that the images only suggested.

The article's ending belongs to the wear test. The next step is to install this version, live with its awkward angles, and see whether those four quiet moments are worth keeping.

---

**Editorial notes:** Replace the pending physical-trial section with Daniel's actual observations before presenting this as a completed review. Add real wrist photos alongside labelled emulator screenshots. No novelty claim has been researched. Sources: [Pebble SDK setup](https://developer.repebble.com/sdk/), project code, test reports and the design conversation. This draft is not published.
