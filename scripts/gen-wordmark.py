#!/usr/bin/env python3
"""Generate the "inkwell" wordmark outline from Fraunces Variable.

Dev-only helper (not run in CI). Instantiates the variable font at the
brand axes, shapes the word with its kerning, and prints the SVG path
plus a tight viewBox. Paste the output into
`src/components/InkwellWordmark.tsx` (WORDMARK_PATH / WORDMARK_VIEWBOX)
and the static splash in `index.html`.

Requires: pip install fonttools brotli
Usage:    python3 scripts/gen-wordmark.py [--weight 600]
"""

import argparse
import pathlib

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"
TEXT = "inkwell"


def kerning(font, left, right):
    """Pair kerning from the GPOS 'kern' feature (PairPos format 1/2)."""
    if "GPOS" not in font:
        return 0
    gpos = font["GPOS"].table
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag != "kern":
            continue
        for li in fr.Feature.LookupListIndex:
            lookup = gpos.LookupList.Lookup[li]
            subtables = lookup.SubTable
            if lookup.LookupType == 9:
                subtables = [s.ExtSubTable for s in subtables]
            for st in subtables:
                if getattr(st, "LookupType", 2) != 2 or left not in st.Coverage.glyphs:
                    continue
                if st.Format == 1:
                    idx = st.Coverage.glyphs.index(left)
                    for rec in st.PairSet[idx].PairValueRecord:
                        if rec.SecondGlyph == right and rec.Value1:
                            return getattr(rec.Value1, "XAdvance", 0) or 0
                elif st.Format == 2:
                    c1 = st.ClassDef1.classDefs.get(left, 0)
                    c2 = st.ClassDef2.classDefs.get(right, 0)
                    v = st.Class1Record[c1].Class2Record[c2].Value1
                    if v and getattr(v, "XAdvance", 0):
                        return v.XAdvance
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weight", type=float, default=600)
    ap.add_argument("--soft", type=float, default=50)
    ap.add_argument("--opsz", type=float, default=72)
    ap.add_argument("--tracking", type=float, default=-10, help="extra advance per glyph, font units")
    args = ap.parse_args()

    font = TTFont(FONT)
    axes = {a.axisTag for a in font["fvar"].axes}
    loc = {"wght": args.weight, "opsz": args.opsz, "SOFT": args.soft, "WONK": 0}
    font = instantiateVariableFont(font, {k: v for k, v in loc.items() if k in axes})

    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    ascent = font["hhea"].ascent

    svg = SVGPathPen(glyphs, ntos=lambda v: str(round(v)))
    bounds = BoundsPen(glyphs)
    names = [cmap[ord(c)] for c in TEXT]
    x = 0
    for i, name in enumerate(names):
        # Flip Y (font units are y-up) and shift so the baseline sits at `ascent`.
        t = (1, 0, 0, -1, x, ascent)
        glyphs[name].draw(TransformPen(svg, t))
        glyphs[name].draw(TransformPen(bounds, t))
        x += hmtx[name][0] + args.tracking
        if i + 1 < len(names):
            x += kerning(font, name, names[i + 1])

    xmin, ymin, xmax, ymax = bounds.bounds
    pad = round(upm * 0.01)
    vb = f"{round(xmin) - pad} {round(ymin) - pad} {round(xmax - xmin) + 2 * pad} {round(ymax - ymin) + 2 * pad}"
    print(f"// Fraunces wght={args.weight} opsz={args.opsz} SOFT={args.soft} WONK=0, upm={upm}")
    print(f'export const WORDMARK_VIEWBOX = "{vb}";')
    print(f'export const WORDMARK_PATH =\n  "{svg.getCommands()}";')


if __name__ == "__main__":
    main()
