"""Writes static/vendor/fonts/axes.json: the variation axes (other than weight) of each catalogue font.

python scripts/font_axes.py static/vendor/fonts

Needs fonttools and brotli (run it in a throwaway container). Each variable font file is opened, its fvar table
read, and every axis except wght recorded as [min, default, max]. Rerun after the catalogue changes (make font-axes).
"""

import json
import re
import sys
import urllib.parse
from pathlib import Path

from fontTools.ttLib import TTFont

root = Path(sys.argv[1] if len(sys.argv) > 1 else "static/vendor/fonts")
out: dict[str, dict] = {}
for css in sorted((root / "css").glob("*.css")):
    text = css.read_text()
    for m in re.finditer(r"src: url\('\.\./files/([^'?]+)", text):
        name = urllib.parse.unquote(m.group(1))
        if "[" not in name:
            continue
        font = TTFont(root / "files" / name)
        axes = {
            a.axisTag: [round(a.minValue, 2), round(a.defaultValue, 2), round(a.maxValue, 2)]
            for a in font["fvar"].axes
            if a.axisTag != "wght" and a.minValue < a.maxValue
        }
        if axes:
            out.setdefault(css.stem, {}).update(axes)
        break
(root / "axes.json").write_text(json.dumps(out, separators=(",", ":"), sort_keys=True))
print(f"{len(out)} fonts with extra axes")
