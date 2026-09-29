# Memory, transfer and frame budget

Target: Pebble Time 2 (`emery` platform), 200 × 228 px, 64 colours (GColor8, 8-bit frame buffer).

## What was measured and what was not

| Quantity | Value | Source |
| --- | --- | --- |
| Tile, worst case | ≤ 16,384 B (Half Dome, 2 km: 14,306 B) | measured: encoder, real data |
| Watch data, fixed | 2 × 16,384 B tile buffers (on screen + receiving), 5,952 B mesh cache, 1,346 B text list, 552 B parsed tile, 1,020 B projection scratch ≈ **41.6 KB** | measured: `sizeof` on the host (same widths on ARM: floats and `int16_t` are 4 and 2 bytes) |
| App heap on emery | **not verified** | SDK and developer docs unreachable from the build environment. `main.c` logs `heap_bytes_free()` at start-up; record it in RELEASE.md |
| Persistent storage | only the last site name (≤ 32 B), index and view | by design: tiles live on the phone, so the persist limit never matters |
| Render time | 0.23 ms per TIN frame and 0.08 ms parse+validate on an x86 host (-O2) | measured on the host. **Watch time not measured**: expect roughly 100–300× slower (soft-float Cortex-M) = tens of ms per rotation step. Measure in the emulator and on hardware |

## Why these limits

- **Mesh: 255 vertices, 480 triangles.** Vertex indices fit in one byte, so the mesh is at most 4 + 255·4 + 480·3 = 2,464 B. 480 filled and outlined triangles is a small amount of per-step work, drawn only when a button is pressed (no animation).
- **Image: 144 × 144 at 4 bits per pixel** = 10,368 B: the largest square that fits between the title bar and the site strip, with room for the other sections inside 16 KB.
- **Grid: 65 × 65** (RTIN needs 2ᵏ + 1). The slope raster is 1,057 B and draws at 2 px per cell (130 px).
- **Two tile buffers** so a failed or malicious transfer can never disturb the tile on screen.

## Transfer

- Inbox 2,048 B (capped at `app_message_inbox_size_maximum()`). Dictionary overhead for a chunk message is 1 + 3 × 7 + 4 + 4 = 30 B, and a further 34 B are kept as margin, giving 1,984-byte chunks. The watch reports its chunk size in HELLO, and the phone uses the smaller of the two values.
- A 14 KB tile is 8 chunks plus BEGIN and END. One message is in flight at a time.
- Recovery: transport NACK → the same message is retried up to 3 times. Out-of-order chunk → the watch sends a single NACK with the offset it expects, and the phone resumes there. CRC or length failure → the phone restarts from BEGIN, at most 3 times. No chunk for 10 s → the watch abandons the transfer and offers a retry.

These were tested against a JS model of the watch and the C reassembler (test/js/transfer.test.js, test/c/test_main.c). They have not yet been tested over real Bluetooth.
