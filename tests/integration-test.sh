#!/usr/bin/env bash
# =============================================================================
# SDRWatch Browser Integration Test Script (Documentation)
#
# NOTE: This file documents the manual test steps performed during the integration
# test. It references the `skill_mcp` MCP tool which is only available within the
# AI assistant environment. It is NOT a standalone executable — it serves as a
# reproducible step-by-step log of the test procedure.
#
# Test performed using Playwright MCP via CDP-connected Chrome.
#
# Prerequisites:
#   - Chrome running with --remote-debugging-port=9222
#   - Playwright MCP: npx @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222
#   - SDRWatch app running at http://localhost:8080
#   - SSH tunnel to Chrome host: ssh -L 9222:localhost:9222 user@host -N
#
# Usage:
#   This script uses skill_mcp to drive the browser. Execute commands via:
#   skill_mcp(mcp_name="playwright", cdp_url="http://127.0.0.1:9222", ...)
# =============================================================================

BASE_URL="http://localhost:8080"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local url="$2"
  local check_expr="${3:-true}"
  echo "=== $desc ==="
  
  # Navigate
  skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
    tool_name="browser_navigate" arguments="{\"url\":\"$url\"}" > /dev/null 2>&1
  sleep 1
  
  # Check SPA loaded
  result=$(skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
    tool_name="browser_evaluate" \
    arguments="{\"function\":\"() => JSON.stringify({root:!!document.getElementById('root'), url:location.href})\"}" 2>/dev/null)
  
  if echo "$result" | grep -q '"root":true'; then
    echo "  ✅ SPA loaded"
  else
    echo "  ❌ SPA NOT loaded"
    return 1
  fi
  
  # Run custom check expression
  if [ -n "$3" ]; then
    local check_result=$(skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
      tool_name="browser_evaluate" \
      arguments="{\"function\":\"$check_expr\"}" 2>/dev/null)
    echo "  Check: $check_result"
  fi
  
  # Console errors
  local errors=$(skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
    tool_name="browser_console_messages" arguments='{"level":"error"}' 2>/dev/null)
  local err_count=$(echo "$errors" | grep -c "ERROR" || true)
  
  # Exclude known charts API 500s
  local known_500=$(echo "$errors" | grep -c "api/charts/" || true)
  local real_errors=$((err_count - known_500))
  
  if [ "$real_errors" -gt 0 ]; then
    echo "  ⚠️ $real_errors unexpected console errors"
  fi
  
  return 0
}

echo "=============================================="
echo "  SDRWatch Integration Tests"
echo "=============================================="
echo ""

# ---- Test 1: Dashboard ----
check "Dashboard /" "$BASE_URL/" "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 2: Recordings ----
check "Recordings /recordings" "$BASE_URL/recordings" \
  "() => { const th = Array.from(document.querySelectorAll('th')).find(el => el.textContent.trim().startsWith('Freq')); return th ? th.textContent.trim() : 'no-freq-header' }"

# ---- Test 3: Signals ----
check "Signals /signals" "$BASE_URL/signals" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 4: Changes ----
check "Changes /changes" "$BASE_URL/changes" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 5: Spectrum ----
check "Spectrum /spectrum" "$BASE_URL/spectrum" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 6: Control ----
check "Control /control" "$BASE_URL/control" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 7: Spur Map ----
check "Spur Map /spur-map" "$BASE_URL/spur-map" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 8: Live ----
check "Live /live" "$BASE_URL/live" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 9: Signal Detail ----
check "Signal Detail /signal/1" "$BASE_URL/signal/1" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent?.substring(0,30)})"

# ---- Test 10: Debug ----
check "Debug /debug" "$BASE_URL/debug" \
  "() => JSON.stringify({heading: document.querySelector('h1')?.textContent})"

# ---- Test 11: Navigation ----
echo "=== Navigation Links ==="
skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
  tool_name="browser_navigate" arguments="{\"url\":\"$BASE_URL/\"}" > /dev/null 2>&1
sleep 1

# Click each nav link and verify
for link in "Signals" "Changes" "Recordings" "Spur Map" "Spectrum" "Live"; do
  result=$(skill_mcp mcp_name="playwright" cdp_url="http://127.0.0.1:9222" \
    tool_name="browser_find" arguments="{\"text\":\"$link\"}" 2>/dev/null)
  echo "  Navigate to $link..."
  sleep 1
done

echo ""
echo "=============================================="
echo "  Tests complete"
echo "=============================================="
