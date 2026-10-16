import os

MODEM_URL = os.getenv("MODEM_URL", "http://192.168.8.1/")
MODEM_FAKE = os.getenv("MODEM_FAKE", "0") == "1"  # test mode, no hardware
API_KEY = os.getenv("API_KEY", "change-me")
DB_PATH = os.getenv("DB_PATH", "sms.db")

# Pause between outgoing messages (carriers flag SIM cards that burst-send)
SEND_INTERVAL = float(os.getenv("SEND_INTERVAL", "6"))
DAILY_LIMIT = int(os.getenv("DAILY_LIMIT", "200"))
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "3"))
INBOX_POLL_SEC = float(os.getenv("INBOX_POLL_SEC", "15"))

# Optional: inbound SMS are POSTed here as JSON (n8n / Make / your app)
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

STOP_WORDS = {"stop", "odjava", "otkazi", "otkaži", "unsubscribe"}
DEFAULT_COUNTRY_PREFIX = os.getenv("DEFAULT_COUNTRY_PREFIX", "+381")

# Orderly bridge: pull approved reminders, report results, forward inbound SMS.
# ORDERLY_URL is the app's base URL; ORDERLY_TOKEN is SMS_GATEWAY_TOKEN there.
ORDERLY_URL = os.getenv("ORDERLY_URL", "").rstrip("/")
ORDERLY_TOKEN = os.getenv("ORDERLY_TOKEN", "")
ORDERLY_POLL_SEC = float(os.getenv("ORDERLY_POLL_SEC", "30"))
