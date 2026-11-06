#!/bin/sh
# The Meta recommendations task (docs/meta-preporuke-zadatak.md) goes through this
# script and nothing else, so it can run with no approval window open.
#   sh scripts/meta-preporuke.sh summary       prints the live summary as JSON
#   sh scripts/meta-preporuke.sh post < x.json writes recommendations, prints the reply
# The token stays inside the script: it is never printed or passed to the caller.
set -eu

BASE="https://orderly-drab.vercel.app/api/ads"
TOK=$(security find-generic-password -a orderly -s orderly-meta-live -w)

case "${1:-}" in
  summary)
    curl -sS --fail-with-body -H "Authorization: Bearer $TOK" "$BASE/live-summary"
    ;;
  post)
    curl -sS --fail-with-body -X POST \
      -H "Authorization: Bearer $TOK" \
      -H "Content-Type: application/json" \
      --data-binary @- "$BASE/recommendations"
    ;;
  *)
    echo "Upotreba: sh scripts/meta-preporuke.sh summary | post" >&2
    exit 2
    ;;
esac
