#!/bin/bash
set -euo pipefail

echo "=== ZION Full Restart ==="

# Install/update unit files from repo
cp /root/zion_backend/systemd/zion-api.service /etc/systemd/system/zion-api.service
cp /root/zion_backend/systemd/zion-watchdog.service /etc/systemd/system/zion-watchdog.service
cp /root/zion_backend/systemd/zion-settlement.service /etc/systemd/system/zion-settlement.service

# Kill any stray processes
pkill -f uvicorn 2>/dev/null || true
pkill -f watchdog 2>/dev/null || true
pkill -f settlement 2>/dev/null || true
screen -wipe 2>/dev/null || true
sleep 3

# Reload and restart systemd services
systemctl daemon-reload
systemctl enable zion-api zion-settlement zion-watchdog 2>/dev/null || true
systemctl restart zion-api
sleep 3
systemctl restart zion-settlement
sleep 2
systemctl restart zion-watchdog
sleep 2
systemctl restart zion-frontend 2>/dev/null || true

echo "=== Status ==="
systemctl is-active zion-api && echo "✅ API running" || echo "❌ API down"
systemctl is-active zion-watchdog && echo "✅ Watchdog running" || echo "❌ Watchdog down"
systemctl is-active zion-settlement && echo "✅ Settlement running" || echo "❌ Settlement down"
curl -s http://localhost:8000/stats | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'✅ Agents: {d.get(\"total_agents\",0)}')" 2>/dev/null || echo "❌ API health check failed"
