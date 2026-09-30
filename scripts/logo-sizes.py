#!/usr/bin/env python3
"""Pre-scale the in-app logo from the 1024 px artwork (needs Pillow).

WebKitGTK downsamples large images roughly, so the app ships one file per
display size instead of shrinking assets/linotes-icon.png on the fly. The dark
variant adds a faint light rim so the black penguin stays visible on the dark
background.

Usage: python3 scripts/logo-sizes.py   (writes assets/logo/mark-{light,dark}-<size>.png)
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "linotes-icon.png"
OUT = ROOT / "assets" / "logo"
# Covers the 28, 56 and 80 px logos at 1x, 2x and fractional scales in between.
SIZES = [32, 48, 64, 96, 128, 160, 192, 256]
RIM_OPACITY = 0.35


def with_rim(image: Image.Image) -> Image.Image:
    # About one CSS pixel wide at the scale each size is used for.
    radius = max(1, round(image.width / 64))
    alpha = image.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(2 * radius + 1)).filter(ImageFilter.GaussianBlur(0.6 * radius))
    rim = Image.new("RGBA", image.size, (255, 255, 255, 0))
    rim.putalpha(grown.point(lambda v: round(v * RIM_OPACITY)))
    rim.alpha_composite(image)
    return rim


def main() -> None:
    master = Image.open(SOURCE).convert("RGBA")
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        light = master.resize((size, size), Image.LANCZOS)
        light.save(OUT / f"mark-light-{size}.png", optimize=True)
        with_rim(light).save(OUT / f"mark-dark-{size}.png", optimize=True)
    print(f"Wrote {2 * len(SIZES)} files to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
