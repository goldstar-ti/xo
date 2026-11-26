"""Turn the workbook .docx into content/workbook.json for the app.

    python scripts/build_workbook.py [--version LABEL] path/to/relapse_prevention_workbook.docx

Run it again whenever the workbook changes. Answers are stored against each prompt's
own number (B.13.1.1 and so on), so they survive a rebuild as long as the numbers do. A docx with no subtitle needs
--version, which sets the label the app shows for the workbook.
Needs:  pip install python-docx
"""

import argparse
import json
import re
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

OUT = Path(__file__).resolve().parent.parent / "content" / "workbook.json"

PARA = {
    "Lead": "lead",
    "SectionTitle": "h",
    "SubHead": "sub",
    "MinorHead": "sub",
    "DeviceHead": "sub",
    "ThreeWayHead": "sub",
    "TwoWayHead": "sub",
    "SideLabel": "sub",
    "GlossaryTerm": "sub",
    "Body Text": "p",
    "ThreeWayBody": "p",
    "TwoWayBody": "p",
    "GlossaryDef": "p",
    "CompareWeak": "p",
    "CompareStrong": "p",
    "Caption": "cap",
    "WordBank": "p",
    "ListBullet": "li",
    "ListNumber": "li",
    "TestItem": "li",
    "CircleOne": "li",
    "KeyPoint": "li",
    "CheckItem": "check",
    "Stem": "stem",
    "WarnInline": "warn",
    "Prompt": "prompt",
}
SKIP = {"TableGap", "AnswerEnd", "Normal", "EditionNote", "Title", "Subtitle"}
PROMPT = re.compile(r"^([A-Z]\.\d+\.\d+\.\d+)\s+(.*)$", re.S)
# Chapters written for a facilitator or clinician: readable in the app, left out of the daily sittings.
REFERENCE_DOCS = {"Facilitator Guide", "Facilitator Brief", "Glossary"}


def clean(text: str) -> str:
    """Strip bullet markers and surrounding space from a paragraph."""
    text = text.replace(" ", " ").strip()
    return re.sub(r"^[•\-]\s*\t?\s*", "", text)


def table_block(table: Table):
    """Turn a table into an example or call-out block, or None for an empty answer box."""
    cells = [
        (p.style.name, clean(p.text))
        for row in table.rows
        for cell in row.cells
        for p in cell.paragraphs
        if p.text.strip()
    ]
    if not cells:
        return None  # an empty table is an answer box
    styles = {s for s, _ in cells}

    def text_of(*names: str) -> str:
        return "\n".join(t for s, t in cells if s in names)

    if styles & {"ExampleGood", "ExampleWeak"}:
        good = "ExampleGood" in styles
        return {
            "t": "eg",
            "good": good,
            "label": text_of("ExampleGoodLabel", "ExampleWeakLabel"),
            "x": text_of("ExampleGood", "ExampleWeak"),
            "why": text_of("ExampleFloor", "ExampleCritique"),
        }
    head = text_of("TrapHead", "WarnHead", "SupportHead")
    tone = (
        "trap"
        if "TrapHead" in styles
        else "warn"
        if styles & {"WarnHead", "WarnBody"}
        else "do"
        if "Instruction" in styles
        else "note"
    )
    body = "\n".join(t for s, t in cells if s not in ("TrapHead", "WarnHead", "SupportHead"))
    return {"t": "call", "tone": tone, "head": head, "x": body}


def slug(text: str) -> str:
    """Make a short lowercase id from a heading."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def build(path: str) -> dict:
    """Read the .docx and return the workbook data."""
    doc = docx.Document(path)
    version = next((clean(p.text) for p in doc.paragraphs if p.style.name == "Subtitle"), "")
    units, unit, part, section = [], None, "Front matter", "main"
    seen_ids, prev_style = {}, ""

    def start(number: str, title: str):
        nonlocal unit, section
        unit = {"number": number, "title": title, "part": part, "blocks": [], "checks": [], "examples": []}
        units.append(unit)
        section = "main"

    for child in doc.element.body:
        tag = child.tag.split("}")[1]
        if tag == "tbl":
            block = table_block(Table(child, doc))
            if block and unit is not None:
                unit["examples" if section == "examples" or block["t"] == "eg" else "blocks"].append(block)
            continue
        if tag != "p":
            continue
        para = Paragraph(child, doc)
        style, text = para.style.name, clean(para.text)
        if style in SKIP or not text:
            continue
        if style == "DocTitle":
            if text == "Planning My Future":
                part = "Planning My Future"
            elif text == "Your Relapse Prevention Plan":
                part = "Relapse Prevention Plan"
            elif text == "Before You Begin":
                part = "Before you begin"
            start("", text)
            if text in REFERENCE_DOCS:
                unit["reference"] = True
        elif style == "ChapterNumber":
            if text.startswith("Concept"):
                part = "Understanding My Past"
            start(text, "")
        elif style == "ChapterTitle":
            if unit is not None and prev_style == "ChapterNumber":
                unit["title"] = text
            else:
                start("", text)
        elif unit is None:
            pass
        elif style == "SectionTitle" and text.lower() == "worked examples":
            section = "examples"
        elif style == "SectionTitle" and text.lower() == "final check":
            section = "checks"
        elif style == "CheckItem" and section == "checks":
            unit["checks"].append(text)
        else:
            kind = PARA.get(style, "p")
            block = {"t": kind, "x": text}
            if kind == "prompt":
                m = PROMPT.match(text)
                if m:
                    block = {"t": "prompt", "id": m.group(1), "x": m.group(2).strip()}
                else:
                    block = {"t": "p", "x": text}
            if section == "examples":
                unit["examples"].append(block)
            else:
                if section == "checks" and kind == "h":
                    section = "main"
                unit["blocks"].append(block)
        prev_style = style

    # Everything after the last unit that has answer boxes is the clinician's framework.
    last_ws = max(i for i, u in enumerate(units) if any(b["t"] == "prompt" for b in u["blocks"]))
    out = []
    for i, u in enumerate(units):
        prompts = [b["id"] for b in u["blocks"] if b["t"] == "prompt"]
        if not u["blocks"] and not prompts:
            continue
        if i > last_ws:
            u["part"], u["reference"] = "A Clinician’s Framework", True
        if u["part"] == "Front matter":
            u["part"] = "Before you begin"
        u["kind"] = "worksheet" if prompts else "reading"
        base = (
            prompts[0].rsplit(".", 2)[0].replace(".", "")
            if prompts
            else "r-" + slug((u["number"] + " " + u["title"]).strip())
        )
        seen_ids[base] = seen_ids.get(base, 0) + 1
        u["id"] = base if seen_ids[base] == 1 else f"{base}-{seen_ids[base]}"
        for key in ("checks", "examples"):
            if not u[key]:
                del u[key]
        out.append(u)
    return {"version": version, "units": out}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build content/workbook.json from the workbook .docx.")
    parser.add_argument("docx", help="path to the workbook .docx")
    parser.add_argument("--version", default=None, help="label stored as the workbook version")
    args = parser.parse_args()
    book = build(args.docx)
    if args.version:
        book["version"] = args.version
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")))
    boxes = sum(1 for u in book["units"] for b in u["blocks"] if b["t"] == "prompt")
    print(f"{OUT}: {len(book['units'])} chapters, {boxes} answer boxes, {OUT.stat().st_size // 1024} KB")
