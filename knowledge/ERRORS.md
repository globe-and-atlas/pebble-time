---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-24T12:30:55.333289+00:00"
---
# Errors

Record deterministic errors, root causes, and fixes here.

2026-09-24: dashboard scaffold omits execution directory; first import-script write failed. Created directory before retry.

2026-09-29: `pebble sdk install latest` failed: sdk.repebble.com denied by the cloud environment's network policy (403 at the proxy). Fix: allow that host (environment network settings). The SDK build and emulator steps wait on it.
2026-09-29: GitHub create_repository in globe-and-atlas returned 403 "You need admin access to the organization". Fix: an org admin creates the repo, or grants access.
2026-09-29: Facet Atlas transfer: after one lost chunk the watch NACKed every later chunk, exhausting the phone's resume budget. Fix: one NACK per gap (fa_xfer gap_reported), and later out-of-order chunks are ignored.
