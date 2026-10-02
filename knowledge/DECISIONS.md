---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-24T12:30:55.333289+00:00"
---
# Decisions

## Initial Decision

- Template profile: `dashboard-static`
- Deploy target: `local-only`
- Runtime: `static`

## 2026-10-02: GNSS Sky (Apple Watch)

- **Location.** Built in `gnss-sky/` as a self-contained folder, because this session can only reach this repository. Move it to its own repository like the Pebble projects.
- **Prediction only.** Public watchOS APIs expose no per-satellite GNSS data (no PRN, azimuth/elevation, C/N0, satellite count or DOP), so the app predicts from orbital elements and labels everything "Predicted". Details: `gnss-sky/docs/watchOS-GNSS-capabilities.md`.
- **Orbital data.** CelesTrak GP element sets (`gnss` + `sbas` groups) are propagated with a Swift port of Vallado SGP4/SDP4, verified against the official `tcppver.out` vectors and against Skyfield.
- **Testability.** All mathematics lives in a Foundation-only Swift package (`GNSSCore`) so it can be tested off-device. A Swift 5.10 toolchain was extracted from Ubuntu archive packages to run the tests in a Linux sandbox.
