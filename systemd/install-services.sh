#!/bin/bash
set -euo pipefail

echo "=== ZION systemd install ==="

# Stop legacy screen/cron launchers before systemd takes over
pkill -f "python3.*watchdog.py" 2>/dev/null || true
pkill -f "uvicorn api:app" 2>/dev/null || true
pkill -f "uvicorn api:app" 2>/dev/null || true
screen -S zion-api -X quit 2>/dev/null || true
screen -S watchdog -X quit 2>/dev/null || true
screen -S settlement -X quit 2>/dev/null || true
screen -wipe 2>/dev/null || true
sleep 2

cp /root/zion_backend/systemd/zion-api.service /etc/systemd/system/zion-api.service
cp /root/zion_backend/systemd/zion-watchdog.service /etc/systemd/system/zion-watchdog.service
cp /root/zion_backend/systemd/zion-settlement.service /etc/systemd/system/zion-settlement.service

systemctl daemon-reload
systemctl enable zion-api zion-settlement zion-watchdog
systemctl restart zion-api
sleep 3
systemctl restart zion-settlement
sleep 2
systemctl restart zion-watchdog

echo ""
echo "=== Service status ==="
systemctl status zion-api zion-settlement zion-watchdog --no-pager || true

# Crontab: remove entries that duplicate watchdog/systemd
BACKUP="/root/crontab.backup.$(date +%Y%m%d%H%M%S)"
crontab -l > "$BACKUP" 2>/dev/null || true
echo "Backed up crontab to $BACKUP"

crontab -l 2>/dev/null | grep -v -E \
  'tax_cron\.py|birth\.py|clans\.py|catastrophes\.py|religion\.py|politics\.py|zionwork\.py|neo\.py|start_zion\.sh|watchdog\.py|curl -s http://localhost:8000' \
  | crontab - 2>/dev/null || crontab -r 2>/dev/null || true

echo ""
echo "=== Crontab after cleanup ==="
crontab -l 2>/dev/null || echo "(empty crontab)"

echo ""
echo "Done. Use: bash /root/zion_backend/restart_all.sh"
