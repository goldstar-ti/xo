"""Settings, read once from environment variables."""

import os


def _flag(name: str, default: str) -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://xo:xo@localhost:5432/xo")
# Random string. Currently unused; kept so existing .env files stay valid.
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
# Leave true in production (HTTPS through Cloudflare). Set false for local http testing.
COOKIE_SECURE = _flag("COOKIE_SECURE", "true")
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))

# Web Push (VAPID). Generate with: python scripts/gen_keys.py
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:you@example.com")

# How often the reminder loop looks for due reminders, in seconds.
SCHEDULER_INTERVAL = int(os.environ.get("SCHEDULER_INTERVAL", "20"))
# Set false in tests so the loop does not run in the background.
SCHEDULER_ENABLED = _flag("SCHEDULER_ENABLED", "true")

# NOBBIE's tracker, read-only (Tracker screen). Off unless all three are set. NOBBIE_URL includes
# NOBBIE's prefix, such as https://nobbie.lan.tifunction.com/nobbie. The user is a NOBBIE account
# that can open the tracker; XO only ever reads.
NOBBIE_URL = os.environ.get("NOBBIE_URL", "")
NOBBIE_USER = os.environ.get("NOBBIE_USER", "")
NOBBIE_PASSWORD = os.environ.get("NOBBIE_PASSWORD", "")
NOBBIE_CACHE_SECONDS = int(os.environ.get("NOBBIE_CACHE_SECONDS", "120"))

# Root log level for the JSON logs: DEBUG, INFO, WARNING or ERROR.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
