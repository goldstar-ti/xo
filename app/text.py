"""Editable text: YAML files in ``content/text`` served to the browser.

Every ``*.yaml`` file holds one top-level key named after the file (``plan.yaml`` holds
``plan:``). The files are read again whenever one changes on disk, so an edit shows up on
the next request with no restart. A file with a mistake in it keeps its last good version.
"""

import logging
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

TEXT_DIR = Path(__file__).resolve().parent.parent / "content" / "text"

# Per file: the modification time last read, and the last good parsed content.
_cache: dict[Path, tuple[int, dict[str, Any]]] = {}


def _read(path: Path, mtime: int) -> None:
    """Parse one file into the cache, keeping the previous version if it is broken.

    Args:
        path: The YAML file.
        mtime: Its modification time in nanoseconds, recorded so the file is not parsed again until it changes.
    """
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("the top level must be a mapping")
    except (OSError, ValueError, yaml.YAMLError):
        # Log the file name only: the error text can quote the file's content.
        logger.warning("text file not read, keeping the last good version", extra={"text_file": path.name})
        previous = _cache.get(path)
        _cache[path] = (mtime, previous[1] if previous else {})
        return
    _cache[path] = (mtime, data)


def load_text(directory: Path | None = None) -> dict[str, Any]:
    """Return every text file merged into one object.

    Args:
        directory: Folder of YAML files. Defaults to ``content/text``.

    Returns:
        The merged top-level keys of all files. A file that cannot be parsed contributes its last good version.
    """
    folder = directory or TEXT_DIR
    paths = sorted(folder.glob("*.yaml"))
    for stale in [p for p in _cache if p.parent == folder and p not in paths]:
        del _cache[stale]
    merged: dict[str, Any] = {}
    for path in paths:
        try:
            mtime = path.stat().st_mtime_ns
        except OSError:
            continue
        cached = _cache.get(path)
        if cached is None or cached[0] != mtime:
            _read(path, mtime)
        merged.update(_cache[path][1])
    return merged
