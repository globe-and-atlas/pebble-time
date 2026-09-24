---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-24T12:30:55.333289+00:00"
---
# Import verification

`python3 execution/import_watchfaces.py` copies tracked and nonignored source files from the former checkout. It omits local agent state, secrets, dependencies, builds and temporary output. Each imported file is SHA-256 compared; evidence lives in `.tmp/import-verification.json`. Do not rerun after modifying the destination unless intentionally refreshing the snapshot.

Intentional post-import edit: watchfaces/time-as-hand/README.md now points both live cd commands to this checkout. Historical paths in archived notes retain provenance. Renderer/location tests pass from the new location.
