"""Build XO's icon files from the Phosphor and Tabler npm packages.

Writes, under static/vendor/icons/:

- phosphor-regular.json, phosphor-fill.json, tabler-outline.json, tabler-filled.json:
  icon name to the inner markup of its SVG (the outer <svg> tag is added in the browser).
- catalogue.json: categories and search tags for each set, plus the package versions.
- LICENSE-phosphor.txt, LICENSE-tabler.txt: both sets are MIT.

and static/js/icon-core.js: the icons the side bar and its buttons need before any file loads.

Usage:
    python3 scripts/build_icons.py [node_modules]

The image build runs it on the packages pinned in tailwind/package.json. Run by hand (make icons),
the default source is NOBBIE's frontend/node_modules; the JSON files are not committed, icon-core.js is.
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "vendor" / "icons"
CORE_JS = ROOT / "static" / "js" / "icon-core.js"
DEFAULT_SRC = Path("/home/pj/projects/GS-AUTO-043_NOBBIE/frontend/node_modules")

# Icons drawn before any icon file loads: the default side bar icons and the side bar's own buttons.
# Keep in step with DEFAULT_ICONS and CHROME in static/js/icons.js.
CORE = [
    "sun",
    "calendar-dots",
    "check-square-offset",
    "note-pencil",
    "handshake",
    "arrows-clockwise",
    "receipt",
    "heartbeat",
    "map-trifold",
    "palette",
    "gear-six",
    "squares-four",
    "kanban",
    "dots-three",
    "caret-double-left",
    "caret-double-right",
    "paint-brush",
    "cardholder",
]

# Tabler Outline icons drawn before any icon file loads (the new defaults). Keep in step with DEFAULT_ICONS and CHROME.
TABLER_CORE = ["sun", "calendar-event", "list-check", "scale", "dots", "palette", "lifebuoy"]


def inner(svg: str) -> str:
    """Return the markup inside an SVG file's outer tag, on one line.

    Args:
        svg: The whole SVG file.

    Returns:
        The child elements, with Tabler's invisible bounding-box path removed.
    """
    body = re.sub(r"^[\s\S]*?<svg[^>]*>", "", svg)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r'<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*/>', "", body)
    return re.sub(r">\s+<", "><", re.sub(r"\s+", " ", body)).strip()


def read_dir(folder: Path, suffix: str = "") -> dict[str, str]:
    """Read every SVG in a folder.

    Args:
        folder: The folder of SVG files.
        suffix: A name ending to strip (Phosphor's fill files end in "-fill").

    Returns:
        Icon name to inner markup, sorted by name.
    """
    out = {}
    for f in sorted(folder.glob("*.svg")):
        name = f.stem[: -len(suffix)] if suffix and f.stem.endswith(suffix) else f.stem
        out[name] = inner(f.read_text())
    return out


def phosphor_catalogue(src: Path) -> dict:
    """Read Phosphor's categories and tags from its package's index.

    Args:
        src: The node_modules folder.

    Returns:
        {"cats": [[label, [names]]], "tags": {name: [tags]}}.
    """
    js = (src / "@phosphor-icons/core/dist/index.mjs").read_text()
    # The third enum in the file is the Figma category: a.MAP = "maps & travel" and so on.
    enums = re.findall(r"\(\(i\) => \(([^)]*?), i\)\)", js)
    figma = dict(re.findall(r'i\.(\w+) = "([^"]+)"', enums[2]))
    cats: dict[str, list[str]] = {}
    tags = {}
    entry = r'name: "([a-z0-9-]+)",\s*pascal_name[\s\S]*?figma_category: a\.(\w+),\s*tags: \[([\s\S]*?)\]'
    for m in re.finditer(entry, js):
        name, cat, raw = m.groups()
        label = figma[cat][:1].upper() + figma[cat][1:]
        cats.setdefault(label, []).append(name)
        tags[name] = [t.lower() for t in re.findall(r'"([^"]+)"', raw) if t != "*new*"]
    return {"cats": [[k, sorted(v)] for k, v in sorted(cats.items())], "tags": tags}


def tabler_catalogue(src: Path) -> dict:
    """Read Tabler's categories and tags from its icons.json.

    Args:
        src: The node_modules folder.

    Returns:
        {"cats": [[label, [names]]], "tags": {name: [tags]}}.
    """
    data = json.loads((src / "@tabler/icons/icons.json").read_text())
    cats: dict[str, list[str]] = {}
    tags = {}
    for name, icon in data.items():
        cats.setdefault(icon.get("category") or "Other", []).append(name)
        tags[name] = [str(t).lower() for t in icon.get("tags", [])]
    return {"cats": [[k, sorted(v)] for k, v in sorted(cats.items())], "tags": tags}


def write(path: Path, obj: object) -> None:
    """Write compact JSON and print its size.

    Args:
        path: Where to write.
        obj: What to write.
    """
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size:,} bytes")


def main() -> None:
    """Build every icon file."""
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    OUT.mkdir(parents=True, exist_ok=True)
    ph = src / "@phosphor-icons/core"
    tb = src / "@tabler/icons"
    regular = read_dir(ph / "assets/regular")
    write(OUT / "phosphor-regular.json", regular)
    write(OUT / "phosphor-fill.json", read_dir(ph / "assets/fill", "-fill"))
    write(OUT / "tabler-outline.json", read_dir(tb / "icons/outline"))
    write(OUT / "tabler-filled.json", read_dir(tb / "icons/filled"))
    versions = {
        "phosphor": json.loads((ph / "package.json").read_text())["version"],
        "tabler": json.loads((tb / "package.json").read_text())["version"],
    }
    catalogue = {"versions": versions, "phosphor": phosphor_catalogue(src), "tabler": tabler_catalogue(src)}
    write(OUT / "catalogue.json", catalogue)
    shutil.copy(ph / "LICENSE", OUT / "LICENSE-phosphor.txt")
    shutil.copy(tb / "LICENSE", OUT / "LICENSE-tabler.txt")
    missing = [n for n in CORE if n not in regular]
    if missing:
        raise SystemExit(f"Core icons missing from Phosphor: {', '.join(missing)}")
    core = {n: regular[n] for n in CORE}
    tabler = read_dir(tb / "icons/outline")
    missing = [n for n in TABLER_CORE if n not in tabler]
    if missing:
        raise SystemExit(f"Core icons missing from Tabler: {', '.join(missing)}")
    tcore = {n: tabler[n] for n in TABLER_CORE}
    CORE_JS.write_text(
        "// Generated by scripts/build_icons.py (make icons). Do not edit.\n"
        "// Phosphor Regular icons the side bar draws before any icon file loads.\n"
        f"export const CORE = {json.dumps(core, indent=0, ensure_ascii=False)};\n"
        "// Tabler Outline icons drawn before any icon file loads.\n"
        f"export const TABLER_CORE = {json.dumps(tcore, indent=0, ensure_ascii=False)};\n"
    )
    print(f"{CORE_JS.relative_to(ROOT)}: {len(core)} icons")


if __name__ == "__main__":
    main()
