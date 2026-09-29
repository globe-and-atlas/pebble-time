#!/usr/bin/env python3
"""Compose host-renderer frames into PNG previews (development aid only).

These are NOT emulator screenshots: text uses DejaVu Sans Condensed as a
stand-in for Pebble's Gothic fonts. Emulator captures live in
docs/screenshots/ and come from `pebble screenshot` (see RELEASE.md).

    python3 tools/previews.py [TILE ...]   # default: the fixture tiles
Requires Pillow. Writes build/previews/*.png.
"""

import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "build" / "host"
OUT = BUILD / "previews"
W, H = 200, 228
FONT_DIR = pathlib.Path("/usr/share/fonts/truetype/dejavu")
FONTS = {  # FaFont -> (file, px), approximating GOTHIC_18_BOLD, 18, 18_BOLD, 14, 24_BOLD
    0: ("DejaVuSansCondensed-Bold.ttf", 14),
    1: ("DejaVuSansCondensed.ttf", 14),
    2: ("DejaVuSansCondensed-Bold.ttf", 13),
    3: ("DejaVuSansCondensed.ttf", 11),
    4: ("DejaVuSansCondensed-Bold.ttf", 18),
}
VIEWS = ["satellite", "tin", "slope", "profile"]


def gcolor(c):
    return (((c >> 4) & 3) * 85, ((c >> 2) & 3) * 85, (c & 3) * 85)


def font(i):
    name, px = FONTS[i]
    path = FONT_DIR / name
    if not path.exists():
        path = FONT_DIR / "DejaVuSans.ttf"
    return ImageFont.truetype(str(path), px)


def compose(prefix, png):
    raw = pathlib.Path(str(prefix) + ".raw").read_bytes()
    img = Image.new("RGB", (W, H))
    img.putdata([gcolor(b) for b in raw])
    draw = ImageDraw.Draw(img)
    for line in pathlib.Path(str(prefix) + ".txt").read_text().splitlines():
        parts = line.split(" ", 8)
        x, y, w, h, f, align, color, bg = map(int, parts[:8])
        text = parts[8] if len(parts) > 8 else ""
        fnt = font(f)
        # Wrap within the box width, like graphics_draw_text with word wrap.
        words, lines, cur = text.split(" "), [], ""
        for word in words:
            trial = (cur + " " + word).strip()
            if draw.textlength(trial, font=fnt) <= w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
        max_lines = max(1, (h + 2) // (fnt.size + 3))
        if len(lines) > max_lines:  # GTextOverflowModeTrailingEllipsis
            lines = lines[:max_lines]
            while lines[-1] and draw.textlength(lines[-1] + "...", font=fnt) > w:
                lines[-1] = lines[-1][:-1]
            lines[-1] += "..."
        ty = y + 3
        for ln in lines:
            tw = draw.textlength(ln, font=fnt)
            tx = x if align == 0 else (x + (w - tw) / 2 if align == 1 else x + w - tw)
            if bg:
                draw.rectangle([tx - 1, ty, tx + tw, ty + fnt.size + 1], fill=gcolor(bg))
            draw.text((tx, ty), ln, font=fnt, fill=gcolor(color))
            ty += fnt.size + 3
    img.resize((W * 2, H * 2), Image.NEAREST).save(png)


def render(tile, name, view, yaw=0, exag=None, *flags):
    exag = exag if exag is not None else 10
    prefix = OUT / f"{name}-{VIEWS[view]}"
    if yaw:
        prefix = pathlib.Path(f"{prefix}-yaw{yaw * 45}")
    args = [str(BUILD / "host_render"), str(tile), str(prefix), str(view), str(yaw), str(exag), *flags]
    subprocess.run(args, check=True)
    compose(prefix, str(prefix) + ".png")
    return str(prefix) + ".png"


def status(name, *args):
    prefix = OUT / name
    subprocess.run([str(BUILD / "host_render"), "--status", str(prefix), *args], check=True)
    compose(prefix, str(prefix) + ".png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = [pathlib.Path(p) for p in sys.argv[1:]] or sorted((BUILD / "fixtures").glob("*.fat"))
    for tile in tiles:
        for view in range(4):
            render(tile, tile.stem, view)
        render(tile, tile.stem, 1, 3)
    if not sys.argv[1:]:
        render(BUILD / "fixtures" / "stale.fat", "stale-badge", 0, 0, 20, "stale")
        status("status-offline", "FACET ATLAS", "PHONE UNREACHABLE",
               "Last site: VALLEY FIXTURE. Tiles are cached on the phone.", "SELECT: RETRY", "255")
        status("status-loading", "FACET ATLAS", "RECEIVING TILE", "VALLEY FIXTURE", "", "40")
        status("status-rejected", "FACET ATLAS", "TILE REJECTED",
               "Transfer incomplete (LENGTH). Previous tile kept.", "SELECT: RETRY", "255")
    print(f"previews in {OUT}")


if __name__ == "__main__":
    main()
