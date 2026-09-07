#!/usr/bin/env python
"""Resize a source logo to the 104x104 @2x asset used in the top bar and login hero.

The UI displays the brand mark at 36-52 CSS px; the checked-in *_104.png files are
the 104px retina sources (e.g. mockigbird_logo.png -> mockigbird_logo_104.png).

Usage (from repo root, needs Pillow):
    uv run --with pillow python ui/scripts/resize_logo.py ui/public/canary_logo.png
    uv run --with pillow python ui/scripts/resize_logo.py ui/public/canary_logo.png --size 104

By default it writes alongside the source with a _<size> suffix.

Hand-drawn sources need three steps the AI-generated ones didn't. They arrive as a
big landscape canvas with the drawing floating somewhere in the middle, so a plain
square resize would squash the bird and shrink it to nothing inside its own margin:

    --trim          crop away the uniform border (sampled from the corner pixel)
    --transparent   make that same border color transparent, so the mark sits on
                    any theme instead of carrying a white tile with it
    --square        pad the trimmed art back out to a square before resizing, which
                    scales it down without distorting it

    uv run --with pillow python ui/scripts/resize_logo.py in.png --trim --transparent \
        --square --size 104 --out ui/public/mockingbird_hand_104.png

--transparent is wrong for art whose background is part of the picture (the fail
whale's sky); trim that one on its own and keep it opaque.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops

SIZE = 104

# How far a pixel may drift from the sampled background color and still count as
# background. Scanned/painted "white" is never exactly #ffffff, and the whale's sky
# is visibly banded, so an exact match would trim nothing at all.
DEFAULT_TOLERANCE = 12


def background_color(img: Image.Image) -> tuple[int, int, int, int]:
    """The presumed background: the most common of the four corner pixels."""
    w, h = img.size
    corners = [
        img.getpixel((0, 0)),
        img.getpixel((w - 1, 0)),
        img.getpixel((0, h - 1)),
        img.getpixel((w - 1, h - 1)),
    ]
    return max(set(corners), key=corners.count)


def _background_mask(img: Image.Image, bg: tuple[int, int, int, int], tolerance: int) -> Image.Image:
    """Greyscale mask: white where the pixel differs from `bg`, black where it matches."""
    flat = Image.new("RGBA", img.size, bg)
    diff = ImageChops.difference(img.convert("RGB"), flat.convert("RGB")).convert("L")
    # Anything within tolerance collapses to 0; everything else to 255.
    return diff.point(lambda v: 255 if v > tolerance else 0)


def trim(img: Image.Image, tolerance: int) -> Image.Image:
    """Crop the uniform border away, leaving the drawing plus nothing."""
    box = _background_mask(img, background_color(img), tolerance).getbbox()
    return img.crop(box) if box else img


def make_transparent(img: Image.Image, tolerance: int) -> Image.Image:
    """Punch the background color out to alpha 0, keeping the drawing opaque.

    Deliberately a hard cutoff rather than a feathered one: these are ink drawings
    with dark outlines, so the boundary between paper and art is a real edge, and a
    soft matte would leave a grey halo once the mark lands on a dark theme.
    """
    img = img.convert("RGBA")
    img.putalpha(_background_mask(img, background_color(img), tolerance))
    return img


def pad_square(img: Image.Image) -> Image.Image:
    """Center the image on a transparent square canvas of its longest edge."""
    edge = max(img.size)
    canvas = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    canvas.paste(img, ((edge - img.width) // 2, (edge - img.height) // 2))
    return canvas


def resize(
    src: Path,
    size: int,
    out: Path | None,
    *,
    do_trim: bool = False,
    transparent: bool = False,
    square: bool = False,
    tolerance: int = DEFAULT_TOLERANCE,
) -> Path:
    if out is None:
        out = src.with_name(f"{src.stem}_{size}{src.suffix}")
    img = Image.open(src).convert("RGBA")
    # Transparency before trimming would leave getbbox() nothing to measure against,
    # since the mask is sampled from the corner color that we just erased.
    if do_trim:
        img = trim(img, tolerance)
    if transparent:
        img = make_transparent(img, tolerance)
    if square:
        img = pad_square(img)
    # Non-square sources (the whale) keep their aspect ratio: `size` is the long edge.
    if img.width == img.height:
        img = img.resize((size, size), Image.LANCZOS)
    else:
        scale = size / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    img.save(out)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="source logo image")
    parser.add_argument(
        "--size", type=int, default=SIZE, help="square edge / long edge in px (default 104)"
    )
    parser.add_argument("--out", type=Path, default=None, help="output path (default: <name>_<size>.png)")
    parser.add_argument("--trim", action="store_true", help="crop the uniform border away")
    parser.add_argument(
        "--transparent", action="store_true", help="make the background color transparent"
    )
    parser.add_argument("--square", action="store_true", help="pad to a square before resizing")
    parser.add_argument(
        "--tolerance",
        type=int,
        default=DEFAULT_TOLERANCE,
        help=f"per-channel background tolerance (default {DEFAULT_TOLERANCE})",
    )
    args = parser.parse_args()

    out = resize(
        args.source,
        args.size,
        args.out,
        do_trim=args.trim,
        transparent=args.transparent,
        square=args.square,
        tolerance=args.tolerance,
    )
    with Image.open(out) as done:
        print(f"Wrote {out} ({done.size[0]}x{done.size[1]} {done.mode})")


if __name__ == "__main__":
    main()
