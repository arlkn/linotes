#!/usr/bin/env python3
"""Pre-scale the in-app logo from the 1024 px artwork (needs Pillow).

WebKitGTK downsamples large images roughly, so the app ships one file per
display size instead of shrinking assets/linotes-icon.png on the fly.
(The faint rim in dark mode is a CSS drop-shadow, so it stays one pixel wide
at every size.)

Usage: python3 scripts/logo-sizes.py   (writes assets/logo/mark-<size>.png)
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "linotes-icon.png"
OUT = ROOT / "assets" / "logo"
# Covers the 28, 80 and 112 px logos at 1x, 2x and fractional scales in between.
SIZES = [32, 48, 64, 96, 128, 160, 192, 256]


def main() -> None:
    master = Image.open(SOURCE).convert("RGBA")
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    for size in SIZES:
        master.resize((size, size), Image.LANCZOS).save(OUT / f"mark-{size}.png", optimize=True)
    print(f"Wrote {len(SIZES)} files to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
