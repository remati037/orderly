#!/bin/zsh
cd "$(dirname "$0")"
# Tajne (API_KEY, ORDERLY_URL, ORDERLY_TOKEN) drži u .env pored ovog fajla; nije u gitu.
[[ -f .env ]] && set -a && source .env && set +a
export API_KEY="${API_KEY:-promeni-me}"      # postavi svoj tajni ključ
# Orderly: preuzima odobrene podsetnike i prima dolazne SMS-ove.
# ORDERLY_TOKEN = token čiji je SHA-256 u settings.sms_gateway_token_sha256 (ili SMS_GATEWAY_TOKEN na Vercelu).
# export ORDERLY_URL="https://orderly-drab.vercel.app"
# export ORDERLY_TOKEN="..."
# export WEBHOOK_URL="https://hook.eu1.make.com/..."   # dodatno: dolazne poruke idu i ovde
# export MODEM_FAKE=1                                   # test bez modema
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
