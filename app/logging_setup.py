"""Structured logging: one JSON object per line on stdout.

Never pass user content to a logger (CLAUDE.md rule 1). Log ids and kinds only.
"""

import json
import logging
import sys
from datetime import datetime, timezone

# Attributes every LogRecord carries; anything else on a record came from ``extra``.
_STANDARD = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime", "taskName"}


class _JsonFormatter(logging.Formatter):
    """Format a record as a single JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        """Render the record.

        Args:
            record: The record to render.

        Returns:
            One line of JSON with ``ts``, ``level``, ``logger``, ``msg``, ``exc`` (when present) and any extra keys.
        """
        out = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in _STANDARD and key not in out:
                out[key] = value
        return json.dumps(out, default=str)


class _SkipHealth(logging.Filter):
    """Drop access lines for the health check, which runs every few seconds."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Return False for a health check access line.

        Args:
            record: The access record.

        Returns:
            Whether the record should be logged.
        """
        return "/api/health" not in record.getMessage()


def setup_logging(level: str = "INFO") -> None:
    """Send all logs, uvicorn's included, to stdout as JSON.

    Args:
        level: Root log level name, such as ``INFO``.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
    access = logging.getLogger("uvicorn.access")
    access.filters[:] = [f for f in access.filters if not isinstance(f, _SkipHealth)]
    access.addFilter(_SkipHealth())
