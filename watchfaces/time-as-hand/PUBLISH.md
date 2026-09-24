---
generated_by: "OpenAI Codex (GPT-6)"
timestamp: "2026-09-23"
---
# Publish Time as Hand

Status: five version0.1.0 releases uploaded through the signed-in dashboard with Unlisted visibility and one current preview image each. Hidden from search/browsing, accessible by direct link. Phone thumbnail refresh awaiting wearer confirmation.

## Easiest route: Pebble Developer Dashboard
1. Test the selected edition on a paired Pebble Time 2, including phone settings, restart persistence and legibility. Emulator success does not establish wrist readability or battery performance.
2. Sign in at [developer.repebble.com/dashboard](https://developer.repebble.com/dashboard). Current sign-in offers Google, GitHub and Apple.
3. Create a watchface listing for each edition you want to release. Suggested titles: **Original**, **Two Hands**, and **Meridian**. They have separate UUIDs; do not upload one edition as an update to the other.
4. Upload the corresponding PBW from `dist/`, enter a description and add representative 200×228 screenshots for Emery/Pebble Time 2. Provide any other metadata the current dashboard requests, such as support contact or icons. Website/source links should point to published locations, never the localhost preview.
5. Review the listing and publish when ready. Keep the UUID stable for future updates; increase package version before rebuilding later releases.

The authenticated dashboard form has not been accessed, so exact button labels and account-specific requirements have not been verified. The entry point and current CLI behavior were verified on 2026-09-23.

| Edition | PBW | UUID |
| --- | --- | --- |
| Original | `dist/time-as-hand-original.pbw` | `8d9227ba-dc65-4c72-a54e-71e917d6194a` |
| Two Hands | `dist/time-as-hand-two-hands.pbw` | `a12bd695-9b47-4a44-b416-43006dc54b9f` |

Both target Emery only. Do not claim support for Pebble Round or other resolutions. The phone settings page is bundled, so there is no configuration website to host. The optional public marketing site is separate from the local preview.

Three verified emulator screenshots per edition are prepared in `assets/store/original/` and `assets/store/two-hands/`. They show the cardinal state, a calendar example and a styled face at native 200×228 resolution. These are emulator captures, not wrist photographs. Regenerate with `python3 execution/prepare_store_assets.py` after successful native comparisons.

## Listing copy to adapt

**Original:** The time becomes the hand. A digital time string follows a twelve-hour dial, briefly becoming a single upright numeral at 3, 6, 9 and 12 o'clock. Choose from twelve custom pixel numeral fonts, 64-color hand pickers and five stroke widths. Add any combination of weekday, day, month and year at the top or bottom. Designed for Pebble Time 2; updates once per minute.

**Two Hands:** Two hands, two numbers. The hour sits near the shorter hand's tip; the minutes sit near the longer hand's tip. Both numbers stay upright. Choose twelve custom pixel numeral fonts, style each hand's color and width, and place your preferred date fields above or below the dial. Designed for Pebble Time 2; updates once per minute.

Do not add battery-life claims, physical-test claims, or originality claims until supported by evidence.

## CLI alternative
Current CLI 5.0.40 supports `pebble login` and `pebble publish`; by default the latter uploads a release without making it immediately visible. `--is-published` makes it visible immediately. Confirm current flags with `pebble publish --help` before use.

Important for this repository: `pebble publish` rebuilds the source project, which normally represents Original. Merely pointing the preview at Two Hands does not select the publishing build. For this first release, upload the already-built PBWs through the dashboard to avoid edition/UUID mismatch.

## Sources
- [Current Pebble Developer Dashboard](https://developer.repebble.com/dashboard)
- [Pebble's April 2026 announcement of CLI and CloudPebble publishing](https://repebble.com/blog/spring-2026-pebble-app-contest)
- Installed CLI `pebble publish --help` and `pebble_tool/commands/publish.py`, version 5.0.40.
- [Official SDK and physical install instructions](https://developer.repebble.com/sdk/)

## Third edition: Meridian
The separate third bundle is `dist/meridian-hemisphere.pbw`, with UUID `bf118b38-aaf3-438d-8c91-0e92c4f757e3` and display name `Meridian`. Use this explicit file, not the default build directory (which is restored to Original). Store copy can start from `RELEASE_NOTES.md`. Name availability/trademark clearance is not established for Meridian.

Hemisphere adds optional location permission. Explain its purpose: center the globe; round coordinates to 0.1°; retain the saved view offline; do not transmit location to a web service. Test phone permission refusal, permission acceptance, settings Save, and a phone-disconnected restart on the physical watch before publication. Check local time across a time-zone change. Latitude/longitude do not choose the clock time zone. The terminator is calculated day/night, not live weather.

## Additional editions: Clear and 4 Points

| Display name | Bundle | UUID |
|---|---|---|
| 4 Points | `dist/four-points.pbw` | `f05945f9-3cd9-462b-88e7-0fef77271d49` |
| Clear | `dist/clear.pbw` | `9f13e2a2-8cce-4163-a5e0-0f5455679749` |

Both are configurable Emery prototypes with independent settings. Store submissions remain unpublished.

## 2026-09-23 — Corrected CLI visibility and phone thumbnails
The CLI help described above is misleading: installed5.0.40 publish.py hardcodes `isPublished=true` in release/create payloads and `visible=true` for create. Do not use it for unlisted uploads. Phone locker thumbnails come from appstore listing screenshots (https://forum.repebble.com/t/adding-preview-image-to-unpublished-watchface/666). Verify dashboard visibility before uploading. Current default-style renderer PNGs for all five faces are in assets/phone-previews/<edition>/emery_preview.png; regenerate with execution/prepare_phone_previews.py. These are renderer exports, not device captures. Dashboard sign-in pending; nothing uploaded.

## Unlisted releases — 2026-09-23

Dashboard confirmed Original,Two Hands,Meridian,4 Points,Clear as Unlisted with published0.1.0 releases and matching preview images. Exact links are recorded in assets/phone-previews/listings.json. Local UUIDs preserved. No source repository or website links submitted. Clear public-link page shows its screenshot. Phone cache refresh remains unobserved.
