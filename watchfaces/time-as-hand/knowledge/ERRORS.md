---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Errors

Record deterministic errors, root causes, and fixes here.

## 2026-09-23 — Scaffold preflight
- Template health check failed before project-specific population; diagnose using full check output after setup.
- execution/ does not exist in static template; create it for deterministic preview and verification scripts.

- Health failure diagnosed: intentionally skipped git initialization during scaffold. Required ignore entries verified; initialize empty local repository without staging or committing.

- Patch expected SDK template main.c; actual filename differs. Inspect generated file list and patch correct path. No renderer validation claimed.

- Patch tool rejects delete/add for the same path in one patch. Use update for existing template file.

- Native CLI discovery: there is no `pebble emu` command; use documented `install --emulator emery` and `emu-set-time`. Build log is at project root .tmp, not watchface/.tmp.

## 2026-09-23 — Native trig guard
- Independent verifier found PBL_PLATFORM absent from SDK defines, so native renderer used host sin/cos branch. Replaced branches with one generated half-degree sine table shared by host/device. Rebuild and exhaustive checks required. Graduated to knowledge/domain/renderer.md.

- Native screenshot comparison returned nonzero; investigate emulator-check.log before claiming pixel parity.

- Emulator 06:00 capture showed host time instead (07:41/07:42), suggesting CLI clock synchronization during screenshot connection. Host renderer checks still pass; native screenshot parity not yet complete.
- Guessed SDK module location absent; locate using scoped rg --files.

- Confirmed SDK screenshot.py documents QEMU 10 Emery ignoring SetUTC/SetLocaltime and following host RTC. Replaced clock-setting test with explicit TAH_TEST_MINUTE build fixtures; finally rebuild/install production without override. Never treat old mismatched clock screenshots as successful fixtures.

- Preview tab opened by an earlier tool was not present in CUA inventory; created a new visible local preview tab and marked it deliverable.
- Health checker reports INDEX.md has no entries despite populated Markdown-link rows; zero health failures, one format-detection warning.

## 2026-09-23 — Skill path lookup
- Error: validation-contract was absent at ~/.agents/skills/validation-contract.
- Cause: skill is workspace-local; locate it before use.
- Fix: search the documented workspace skill roots. No product change.

## 2026-09-23 — Empty patch hunk
- Error: apply_patch rejected an empty trailing documentation hunk.
- Cause: malformed edit request; no files changed.
- Fix: remove empty hunk and reapply atomic patch.

## 2026-09-23 — Calendar native build failure
- Error: both edition builds returned nonzero after adding Clay.
- Evidence: .tmp/build-edition-0.log and .tmp/build-edition-1.log.
- Status: inspect compiler/bundler logs before concluding cause.
- Cause: SDK reused generated message_keys header with old dummy key after package.json changed.
- Fix: cleaned SDK build output; rebuilding changed message keys.
- Graduated-to: knowledge/domain/deps.md.

## 2026-09-23 — Documentation working directory
- Error: append paths failed from watchface/ because knowledge/ lives at project root.
- Fix: execute knowledge writes from project root; no existing files were changed by failed appends.

## 2026-09-23 — Generated key header location
- Error: build/src/message_keys.auto.h did not exist.
- Fix: locate actual generated header rather than assume SDK layout.

## 2026-09-23 — Two Hands emulator mismatch
- Error: first Two Hands calendar fixture differed by 1696 pixels; Original fixtures and persisted setting passed.
- Evidence: .tmp/native-calendar-1-1200-top.png and .tmp/calendar-emulator.log.
- Production rebuild restored in finally. Inspect screenshot and installation before attributing cause.

## 2026-09-23 — Fixture script working directory
- Error: py_compile execution path was relative to watchface/ instead of project root.
- Fix: use project-root cwd for execution scripts; run SDK clean separately in watchface/.

## 2026-09-23 — Emulator launch/render failure
- Error: explicitly launching Original produced a near-full-frame mismatch; subsequent split launch reported Original UUID.
- Evidence: .tmp/native-calendar-0-1200-top.png; .tmp/calendar-emulator.log.
- Status: inspect emulator screen and logs. Distributables rebuilt in finally; emulator launch still unverified.

## 2026-09-23 — Cross-edition launch readiness
- Error: readiness query still reported prior UUID after 15 seconds. A repeated log append also targeted watchface/knowledge; corrected to absolute project knowledge path.
- Evidence: .tmp/calendar-emulator.log. Reboot restored a live Two Hands display; cross-edition switching remains under investigation.
- SDK util/qemu.py lookup was absent; use file discovery for SDK internals if needed. Explicit Original bundle install reported success.

## 2026-09-23 — Bundle inspection import
- Error: PebbleHardware is not exported by libpebble2.protocol.system.
- Fix: inspect bundle.py imports and use the correct module before rerun.
- Follow-up: SDK enum has no literal EMERY member; inspect hardware.py for concrete board identifier.
- Fresh emulator process still resumed the previous UUID when switching editions. Next diagnostic: stop active app before changing UUIDs; retain all persistent data.
- Fix confirmed visually: stop current emulator app via AppRunStateStop before installing a different edition. Original now launches with live time and its retained calendar. Added stop step to fixture/restart flow; full comparison rerun pending.
- Graduated-to: knowledge/procedural/run_prototype.md (emulator lifecycle).

## 2026-09-23 — Emulator protocol timeout during fixture batch
- Native Original date/style/persistence captures passed; Two Hands date captures through 06:30 passed.
- A later readiness query timed out in libpebble2; finally rebuilt bundles but installation stalled. Treat as emulator transport failure, not pixel evidence failure.
- Narrow remaining native checks and restart emulator transport between editions.

## 2026-09-23 — patch format
Combined delete/add of the same file rejected by apply_patch. No files changed. Use Update File for replacement.

## 2026-09-23 — Hemisphere build failed
Native build returned exit 1 for edition 2 and restoration build 0. Logs retained in .tmp/build-edition-*.log; diagnosing before delivery.

Hemisphere build retry: indentation warnings resolved; edition 2 still fails, while restoration build now succeeds. Inspecting linker output.

## 2026-09-23 — emulator helper path
Stop helper invoked relative to watchface instead of project root. Correct command from watchface is python3 ../execution/stop_emulator_app.py; repeat stop/install before screenshot acceptance.

## 2026-09-23 — emulator install
Hemisphere native check could not install after earlier launch attempt. Logs in .tmp/hemisphere-emulator.log. Inspecting before retry.

Hemisphere emulator retry after transport restart installed but did not remain active (stock app UUID observed). Need native launch logs; not accepted as a working build. Error-log append initially used wrong working directory; use absolute project paths.

## 2026-09-23 — native launch fault
Meridian logs show PC 0x1456 / LR 0x143d app fault. Retain edition-2 ELF in .tmp/meridian.elf for symbol resolution. Host success is insufficient; investigate native fault.

Diagnosis: native atan2f returned invalid huge longitudes for ordinary inputs, unlike host libm. Finite/index guard stopped the crash but produced incomplete geography. Replaced atan2f with a range-reduced polynomial without indexed constant tables; native parity check required.

Post-math-fix test hit emulator install failure before launch; transport reset required, separately from renderer fault.

Documentation patch rejected for empty trailing hunk; no files changed. Resubmit only populated hunks.

Emulator transport restart then stop helper timed out after20s. Close persistent log client before relaunch; no renderer conclusion from this transport error.

Native launch repaired; first pixel comparison now differs by1,250 pixels. Investigating solar/math parity, not accepting visual similarity.

Release-notes patch rejected for another empty trailing hunk; remove placeholder update before retry.

Native world/London comparisons now pass exactly. Restart comparison revealed empty phone sandbox sending its world default over the persisted native location. Refresh now leaves watch storage intact until phone settings actually exist; test extended to a real minute tick.

Final native run still differs in clock pixels after localtime recomputation; investigating library time caching. Earlier immediate frames passed; must verify elapsed ticks.

Hour mismatch remains after removing gmtime and reboot. Earlier cache-cause inference is unconfirmed; investigate emulator timezone sync. Initial targeted SDK path assumed Python3.13 incorrectly; resolve module path from runtime.

Correction: gmtime-cache attribution was not established. Installed CLI resets emulator timezone on every connection; Emery RTC ignores some SetUTC behavior. Run final native fixtures with explicit process TZ=UTC and freshly launched QEMU; host DST tests remain separate. Physical non-UTC/DST validation remains open.

Final UTC native cases passed through real minute tick. Cross-edition regression installation acknowledged but active UUID stayed Meridian; add explicit start only after completed install and observed stable mismatch, avoiding the prior during-install race.

Cross-edition UUID did not switch even after deferred explicit Start. Hemisphere five core checks pass; investigate native logs or restart transport between distinct editions before accepting regression status.

Cross-edition install/start remains stuck on Meridian without a native crash. Extra legacy-native smoke is optional (--legacy-smoke) and is not claimed passing. Core Hemisphere contract has five successful runtime checks; completing final same-edition restore. Legacy host regression suite passes; earlier legacy native evidence remains historical.

Delivery recorder correctly refused to finalize before sixth native report was available. No completion records were written; wait for final check before rerunning.

Final redundant reinstall timed out after60s. Five completed production-Hemisphere checks already establish core acceptance; no final reinstall is claimed. Stop repeating passed checks. Optional legacy smoke/final return remain tooling limitations.

## 2026-09-23 — Stale .pyc masked an A/B test
- Error: swapping two same-size versions of execution/preview.py within one second left Python running the cached old bytecode, so the "fixed" run still failed.
- Cause: .pyc invalidation keys on source mtime (1s resolution) and size; a reordered except clause keeps the size identical.
- Fix: when A/B-testing a source edit, run with PYTHONDONTWRITEBYTECODE=1 and clear execution/__pycache__ between versions. Deterministic; no product change.
- Also: verify_preview.py's readiness poll must treat URLError as "not up yet" (the server compiles the renderer before binding).

## 2026-09-23 — Emulator hung after stale qemu processes
- Error: check_hemisphere_emulator.py died at its first stop() (`pebble repl` 20s timeout); then even a bare `pebble install --emulator emery` hung 10 min with no output. Seven old qemu-pebble processes were also running.
- Cause: corrupted/stale emulator state after many runs; `pebble kill` did not clear the processes. Not a renderer fault.
- Fix: `pebble kill; pkill -f qemu-pebble; pebble wipe`, then install succeeded in 4s and all five native comparisons passed. Wrap emulator calls in a hard timeout when scripting. Graduated to knowledge/procedural/verify_hemisphere.md.

## 2026-09-23 — physical Meridian unresponsive
Dev Connect install acknowledged success. Device screenshot shows Meridian is not responding. Collecting logs before acceptance. Initial log write used wrong cwd; corrected to absolute project path.

## 2026-09-23 — Dev Connect diagnostic connection lost
The bounded logs-before-install attempt authenticated with the proxy but waited for the phone until interrupted after 30 seconds. No install or native timing measurement occurred in this attempt. This is a connection blocker, not evidence of the rendering failure cause. The diagnostic wrapper returned zero despite timeout; its output must be inspected. Evidence: `.tmp/device-startup.log`.

## 2026-09-23 — Bundle inspector interpreter
Running inspect_bundles.py with system python3 failed because libpebble2 is installed in the SDK environment. Use the interpreter recorded in the project run procedure. No bundle failure was established.

## 2026-09-23 — Connected diagnostic reinstall timeout
Phone connected; logs-before-install attempt received other running watchface phone logs but no installation acknowledgement in 35 seconds. Native timing absent. No runtime cause established.

## 2026-09-23 — Emulator preflight stopped
Native comparison failed before installation because stop_emulator_app.py repl command returned 1. Renderer host checks passed. Inspect/restart emulator before drawing conclusions about bitmap change.

CLI has no emu-info command; invalid command had no effect. An error-log append used watchface/ cwd and failed; corrected to absolute path.

Direct emulator install also timed out fetching WatchVersion before installing the candidate. Restart emulator process; no candidate runtime evidence yet.

Emulator retry timed out before stop/install. Process inspection found two qemu-pebble instances using the same emery flash image. Stop both observed emulator processes before restarting; physical watch is unaffected.

Bitmap candidate installed but physical capture still says Meridian is not responding (.tmp/meridian-device-bitmap.png). Bitmap optimization alone does not resolve failure. Investigate earlier render/launch stages.

Batched render installed but physical capture still errors. Launch logs now show native App fault PC 0x2c72 LR 0 after hands 203ms. This disproves treating callback duration alone as established cause. Resolve PC against .tmp/meridian.elf.

Incremental candidate passed five Meridian emulator captures. Optional legacy smoke failed switching UUID (still reported Meridian) before screenshot; no visual regression established. Build changes overlapped this late smoke; serialize final validation. Log write again used watchface cwd; corrected absolute path.

Square-root candidate advances but faults at PC0x2e7e in __ieee754_rem_pio2f, indexed load from SDK trig reduction table. Replace bounded-angle reducer with double arithmetic and two-part float remainder; solar/projection angles stay below32 radians. sqrt numerical oracle passed1,287,073 cases; historical images101 pass.

After final math build install, screenshot shows Loading instead of fault. Subsequent 40-second diagnostic connection timed out waiting for phone, with no launch acknowledgement. Physical completion and minute tick remain unverified; asking wearer for current state.

Final read-only screenshot retry still waited for phone; interrupted cleanly without capture. No additional hardware evidence.

Contrast edition emulator suite stopped before installation in stop_emulator_app.py (repl returned1). Host and independent contrast oracle pass; use actual device captures for this palette-only update rather than treating old emulator report as fresh.

Color-picker implementation review caught preview range validation still accepting only old8color IDs, which would reject new selections with400. Expanded to new10..73 range; verifier adds full64 coverage. Browser setup also needed explicit browser/tab due duplicate local tabs; selected existing tab1.

Color-picker device install waited for phone without connecting; interrupted. Updated PBWs built but this attempt did not install them. Native emulator and browser checks passed.

2026-09-23: Clear/4 Points native emulator installation command exited1 before screenshot comparison. Infrastructure diagnosis pending; host review passed. See .tmp/clear-points-native.log.

2026-09-23: emulator reconnect after kill succeeded; first4 Points capture differs by12081 pixels. Inspect screenshot before identifying cause; native acceptance remains open.

2026-09-23: emulator screenshot shows stale Meridian not-responding screen after new-edition install, not new-edition rendering. Clear emulator-only state before retesting. Physical watch unaffected.

2026-09-23: emulator wipe retry still captured error-screen-sized mismatch (44600 pixels). Native acceptance unresolved; do not interpret successful bundle builds as a native pass. Physical Dev Connect remained waiting and was interrupted without installation.

2026-09-23: official new-domain publishing guide returned404; used current forum and installed CLI source. CLI5.0.40 publish.py hardcodes isPublished=true for create/release and visible=true for create despite help defaultfalse. Do not use CLI to promise private/unlisted listing. No upload attempted.
