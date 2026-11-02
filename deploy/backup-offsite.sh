#!/usr/bin/env bash
# Copy the newest daily backup off the server (run from your own computer, or cron on another box).
#   bash deploy/backup-offsite.sh you@your-vps ~/dugout-backups
set -euo pipefail
HOST=${1:?usage: backup-offsite.sh user@vps local-folder}
DEST=${2:?usage: backup-offsite.sh user@vps local-folder}
mkdir -p "$DEST"
ssh "$HOST" 'cd ~/dugout-hq && docker compose exec -T app sh -c "ls -1t /app/data/backups/*.db | head -1 | xargs cat"' > "$DEST/dugout-$(date +%F).db"
echo "Saved $DEST/dugout-$(date +%F).db"
