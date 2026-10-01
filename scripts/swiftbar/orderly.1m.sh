#!/bin/zsh
# <swiftbar.title>Orderly — today's revenue</swiftbar.title>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
#
# SwiftBar plugin: today's revenue in the menu bar, refreshed every minute
# (the ".1m." in the file name). Needs MENUBAR_TOKEN set on the server.
# The token lives in the macOS Keychain:
#   security add-generic-password -a "$USER" -s orderly-menubar -w '<MENUBAR_TOKEN>'

ORDERLY_URL="${ORDERLY_URL:-https://orderly.vercel.app}"

token="${ORDERLY_TOKEN:-$(security find-generic-password -s orderly-menubar -w 2>/dev/null)}"
if [[ -z "$token" ]]; then
  echo "Orderly ⚠︎"
  echo "---"
  echo "Token missing in Keychain (service: orderly-menubar)"
  exit 0
fi

json=$(curl -sf --max-time 20 -H "Authorization: Bearer $token" "$ORDERLY_URL/api/menubar")
if [[ $? -ne 0 || -z "$json" ]]; then
  echo "Orderly ⚠︎"
  echo "---"
  echo "No data from $ORDERLY_URL (offline or bad token)"
  echo "Open Orderly | href=$ORDERLY_URL"
  exit 0
fi

read -r currency revenue orders y_revenue y_orders last_at <<<"$(jq -r '[
  .base_currency, .revenue, .orders, .yesterday_revenue, .yesterday_orders,
  (.last_order_at // "" | if . == "" then "-" else
    sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601 | strflocaltime("%H:%M") end)
] | @tsv' <<<"$json")"

# 1234.5 → "€1.235" / "123.457 RSD" (dot thousands separator, no decimals).
money() {
  local n
  n=$(LC_NUMERIC=de_DE.UTF-8 printf "%'.0f" "$1")
  case "$currency" in
    EUR) echo "€$n" ;;
    USD) echo "\$$n" ;;
    *)   echo "$n $currency" ;;
  esac
}

if (( revenue >= y_revenue )); then arrow="↑"; color="#34c759"; else arrow="↓"; color="#ff453a"; fi
if (( y_revenue > 0 )); then
  pct=$(printf "%+.0f%%" $(( (revenue - y_revenue) * 100.0 / y_revenue )))
else
  pct="—"
fi

echo "$(money $revenue) $arrow | sfimage=cart sfcolor=$color"
echo "---"
echo "Today: $(money $revenue) · $orders orders"
echo "Yesterday by this time: $(money $y_revenue) · $y_orders orders"
echo "vs. yesterday: $pct | color=$color"
echo "Last order: $last_at"
echo "---"
echo "Open Orderly | href=$ORDERLY_URL"
echo "TV board | href=$ORDERLY_URL/tv"
echo "Refresh | refresh=true"
