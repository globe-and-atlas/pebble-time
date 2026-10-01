#!/usr/bin/env python3
"""Turn host-rendered frames (PPM + text log) into upscaled PNGs and a contact sheet.

The C mock renders the vector drawing exactly; text is not rasterised by the mock, so this
script overlays it with a stand-in font. Glyph shapes and vertical placement are only
approximate (Pebble's Gothic and LECO fonts are not available here): treat text position as
a layout check, not a pixel-accurate preview.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SCALE = 3
FONT_FILES = {
    "GOTHIC_14": ("DejaVuSans.ttf", 12),
    "GOTHIC_14_BOLD": ("DejaVuSans-Bold.ttf", 12),
    "LECO_32_BOLD_NUMBERS": ("DejaVuSansMono-Bold.ttf", 30),
}


def render(base: Path) -> Image.Image:
    img = Image.open(base.with_suffix(".ppm")).convert("RGB")
    img = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    draw = ImageDraw.Draw(img)
    for line in base.with_suffix(".txt").read_text().splitlines():
        x, y, w, h, font, align, rgb, text = line.split("\t", 7)
        x, y, w, h, align = int(x), int(y), int(w), int(h), int(align)
        colour = tuple(int(c) for c in rgb.split(","))
        name, size = FONT_FILES.get(font, ("DejaVuSans.ttf", 12))
        f = ImageFont.truetype(name, size * SCALE)
        bbox = draw.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        tx = {0: x * SCALE, 1: (x + w / 2) * SCALE - tw / 2, 2: (x + w) * SCALE - tw}[align]
        # Gothic 14 puts capitals ~3 px below the top of its box; LECO digits start ~2 px down.
        ty = (y + (3 if size < 20 else 2)) * SCALE - bbox[1]
        draw.text((tx, ty), text, font=f, fill=colour)
    return img


def main() -> None:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src
    out.mkdir(parents=True, exist_ok=True)
    images = []
    for ppm in sorted(src.glob("*.ppm")):
        img = render(ppm.with_suffix(""))
        img.save(out / (ppm.stem + ".png"))
        images.append((ppm.stem, img))
    cols = 4
    cw, ch = images[0][1].size
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + 12) + 12, rows * (ch + 34) + 12), (28, 28, 28))
    d = ImageDraw.Draw(sheet)
    label_font = ImageFont.truetype("DejaVuSansMono.ttf", 16)
    for i, (name, img) in enumerate(images):
        x, y = 12 + (i % cols) * (cw + 12), 12 + (i // cols) * (ch + 34)
        d.text((x, y), name, font=label_font, fill=(220, 220, 220))
        sheet.paste(img, (x, y + 22))
    sheet.save(out / "contact_sheet.png")
    print("wrote", len(images), "frames and contact_sheet.png to", out)


if __name__ == "__main__":
    main()
