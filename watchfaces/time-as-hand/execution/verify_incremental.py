#!/usr/bin/env python3
"""Compare chunked frames to historical output plus the intentional palette delta."""
from __future__ import annotations

import ctypes
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'cade550b6908856dd0b52cdd7a17b1b4af61becb'
SIZE = 200 * 228
Buffer = ctypes.c_uint8 * SIZE
Pointer = ctypes.POINTER(ctypes.c_uint8)


def library(baseline: bool) -> ctypes.CDLL:
    """Keep separate source/library names so the loader cannot reuse a handle."""
    folder = ROOT / '.tmp' / 'incremental-test' / ('baseline' if baseline else 'candidate')
    folder.mkdir(parents=True, exist_ok=True)
    source = ROOT / 'watchface/src/c'
    for path in source.iterdir():
        if path.suffix not in ('.h', '.inc', '.c') or path.name == 'watchface.c':
            continue
        # Added after the historical renderer; its face.c has no such include.
        if baseline and path.name == 'colors.inc':
            continue
        data = (subprocess.run(['git', 'show', f'{BASELINE}:watchface/src/c/{path.name}'],
                               cwd=ROOT, check=True, capture_output=True).stdout
                if baseline else path.read_bytes())
        (folder / path.name).write_bytes(data)
    output = folder / 'renderer.dylib'
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', str(folder / 'face.c'),
                    '-o', str(output)], check=True)
    lib = ctypes.CDLL(str(output))
    lib.face_render_custom.argtypes = [ctypes.c_int] * 14 + [Pointer]
    lib.face_globe_overlay.argtypes = [ctypes.c_int] * 8 + [Pointer]
    if not baseline:
        lib.face_globe_prepare.argtypes = [ctypes.c_int] * 3
        lib.face_globe_prepare.restype = ctypes.c_int
        lib.face_globe_overlay_rows.argtypes = [ctypes.c_int] * 8 + [Pointer] + [ctypes.c_int] * 2
    return lib


def hands(lib: ctypes.CDLL, number: int, pixels: Buffer) -> None:
    lib.face_render_custom(number % 24, (number * 17) % 60, 2, 2026, 9, 23, 3,
                           15, number % 2, number % 12, 1 + number % 8,
                           1 + (number + 3) % 8, 1 + number % 5, 1 + (number + 2) % 5, pixels)


def parameters(number: int, location: tuple[int, int]) -> tuple[int, ...]:
    return (number % 24, (number * 17) % 60, 2026, 1 + (number * 31) % 365,
            (number * 113) % 1440, *location, number % 2)


def prepare(lib: ctypes.CDLL, location: tuple[int, int], chunk: int) -> int:
    for count in range(1, 201):
        if lib.face_globe_prepare(*location, chunk):
            return count
    raise AssertionError(f'Preparation failed to finish: {location}, chunk={chunk}')


def main() -> None:
    old, new = library(True), library(False)
    locations = [(0, 0), (5150, -10), (-3390, 15120), (3570, 13970),
                 (9000, 18000), (-9000, -18000), (4190, -8760)]
    cases = 0
    contrast_pixels = 0
    protected_pixels = 0

    def compare(number: int, location: tuple[int, int], chunk: int, pixels: Buffer | None = None) -> None:
        nonlocal cases, contrast_pixels, protected_pixels
        expected, actual = Buffer(), pixels if pixels is not None else Buffer(*([255] * SIZE))
        hands(old, number, expected)
        original_hands = bytes(expected)
        old.face_globe_overlay(*parameters(number, location), expected)
        # Transform historical OUTPUT, never its source: the accepted contrast
        # change affects globe-only gray pixels. The hands buffer independently
        # protects time/date glyphs even when they use those palette indices.
        changed = 0
        for index, hand in enumerate(original_hands):
            if hand:
                assert expected[index] == hand, 'Historical overlay changed a label'
                protected_pixels += 1
            elif expected[index] in (9, 7):
                expected[index] = {9: 7, 7: 1}[expected[index]]
                changed += 1
        assert changed > 0, 'Contrast fixture contains no eligible globe pixels'
        contrast_pixels += changed
        hands(new, number, actual)
        prepare(new, location, chunk)
        for row in range(37, 192, chunk):
            new.face_globe_overlay_rows(*parameters(number, location), actual, row, min(row + chunk, 192))
        assert bytes(actual) == bytes(expected), (number, location, chunk, 'pixel mismatch')
        assert all(not hand or actual[index] == hand
                   for index, hand in enumerate(original_hands)), 'Time/date pixels changed'
        assert max(actual) < 10, 'Uninitialized or converted pixels survived reset'
        cases += 1

    # Independent historical implementation catches shared full/chunked regressions.
    for number in range(24):
        for chunk in (1, 2, 7, 153):
            compare(number, locations[number % len(locations)], chunk)

    # Abandon unfinished location A, then finish B, then return to A.
    new.face_globe_prepare(1234, 5678, 2)
    new.face_globe_prepare(1234, 5678, 2)
    compare(25, locations[1], 2)
    compare(26, (1234, 5678), 2)
    assert prepare(new, (1234, 5678), 2) == 1, 'Completed cache was not reusable'
    compare(27, (1234, 5678), 2)

    # Supersede a partly overlaid image with new minute/style values, reusing cache.
    interrupted = Buffer()
    hands(new, 28, interrupted)
    prepare(new, locations[2], 2)
    new.face_globe_overlay_rows(*parameters(28, locations[2]), interrupted, 37, 109)
    compare(29, locations[2], 2, interrupted)
    # A completed ARGB framebuffer must also be fully replaced on next render.
    converted = Buffer(*([255] * SIZE))
    compare(30, locations[3], 2, converted)
    report = {'status': 'pass', 'pixel_comparisons': cases, 'baseline_commit': BASELINE,
              'expected_output_transform': 'hands-only=0: palette 9->7, 7->1; other pixels unchanged',
              'globe_pixels_darkened': contrast_pixels,
              'time_date_pixels_preserved': protected_pixels,
              'coverage': ['chunk sizes 1/2/7/153', 'location interruption', 'cached restart',
                           'partial overlay superseded', 'ARGB buffer reset'],
              'boundary': 'Host renderer only; native scheduling and device responsiveness require device checks.'}
    (ROOT / '.tmp' / 'incremental-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
