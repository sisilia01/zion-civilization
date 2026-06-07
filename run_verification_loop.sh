#!/usr/bin/env bash
# Run one full verification pass — all 6 cycle scripts + civilization sanity checks.
set -euo pipefail
cd "$(dirname "$0")"

PASS=0
FAIL=0

check_script() {
  local name="$1"
  echo ""
  echo "========== $name =========="
  local out
  out=$(python3 "$name" 2>&1 | tail -3) || true
  echo "$out"
  if echo "$out" | grep -q '✅'; then
    echo "→ PASS"
    PASS=$((PASS + 1))
  else
    echo "→ FAIL"
    FAIL=$((FAIL + 1))
  fi
}

check_script governance_tick.py
check_script corporations.py
check_script tax_cron.py
check_script birth.py
check_script clans.py
check_script zrs.py

echo ""
echo "========== verify_civilization.py =========="
if python3 verify_civilization.py; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
fi

echo ""
echo "========== SUMMARY =========="
echo "Passed: $PASS / 7"
echo "Failed: $FAIL / 7"
[[ "$FAIL" -eq 0 ]]
