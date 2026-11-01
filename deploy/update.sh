#!/usr/bin/env bash
# Pull the latest code and rebuild with no downtime for Caddy.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build app
docker image prune -f >/dev/null
docker compose ps
