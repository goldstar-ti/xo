"""Settings, read once from environment variables."""
import os


def _flag(name: str, default: str) -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://xo:xo@localhost:5432/xo"
)
# Random string. Used only to answer salt requests for unknown usernames
# consistently, so the login form does not reveal which usernames exist.
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
