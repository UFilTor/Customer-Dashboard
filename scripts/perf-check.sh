#!/bin/bash
# Perf check: loading time + filter/dashboard switch responsiveness.
# Usage: bash scripts/perf-check.sh [base_url]
# Auto-detects the dashboard on :3000 or :3001 if no base_url given.

set -u

detect_base() {
  for port in 3000 3001; do
    # The dashboard answers 200 on /; other apps on the port may redirect
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$port/" 2>/dev/null)
    if [ "$code" = "200" ]; then
      echo "http://localhost:$port"
      return
    fi
  done
}

BASE="${1:-$(detect_base)}"
if [ -z "$BASE" ]; then
  echo "FAIL: no dev server responding with 200 on :3000 or :3001"
  exit 1
fi

SLOW_MS=2000
fail=0

check() {
  local label="$1" url="$2"
  local out code t ms
  out=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 120 "$BASE$url")
  code=${out%% *}
  t=${out##* }
  ms=$(awk -v t="$t" 'BEGIN { printf "%d", t * 1000 }')
  local flag=""
  [ "$code" != "200" ] && flag=" <-- HTTP $code" && fail=1
  [ "$ms" -gt "$SLOW_MS" ] && flag="$flag <-- SLOW (>${SLOW_MS}ms)" && fail=1
  printf "%-52s %4s  %6sms%s\n" "$label" "$code" "$ms" "$flag"
}

echo "Base: $BASE  ($(date '+%H:%M:%S'))"
echo "--- Dashboard switches (bulk routes) ---"
check "Status        GET /api/attention" "/api/attention"
check "Onboarding    GET /api/onboarding" "/api/onboarding"
check "Pay Migration GET /api/pay-migration" "/api/pay-migration"
echo "--- Filter switches (per-owner cache keys) ---"
check "Onboarding filter: Filip" "/api/onboarding?ownerIds=1939229547"
check "Onboarding filter: Anders" "/api/onboarding?ownerIds=962517007"
check "Onboarding filter: Cecilia" "/api/onboarding?ownerIds=559364799"
check "Onboarding filter: DK (Anders+Marc)" "/api/onboarding?ownerIds=962517007,44912650"
echo "--- Page shell ---"
check "GET /" "/"

if [ "$fail" = "1" ]; then
  echo "RESULT: SLOW/FAIL responses detected"
else
  echo "RESULT: all responses fast (<${SLOW_MS}ms)"
fi
