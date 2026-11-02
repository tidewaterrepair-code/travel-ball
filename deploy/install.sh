#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu/Debian VPS. Run from inside the repo folder:
#   sudo bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $EUID -ne 0 ]]; then echo "Please run with sudo: sudo bash deploy/install.sh"; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin missing. Install docker-compose-plugin and re-run."; exit 1; }

if [[ ! -f .env ]]; then
  read -rp "Domain for the app (e.g. app.yourdomain.com): " DOMAIN
  read -rp "Your email (HTTPS notices + your admin sign-in): " EMAIL
  printf 'DOMAIN=%s\nEMAIL=%s\nADMIN_EMAILS=%s\nRESEND_API_KEY=\nEMAIL_FROM=\nBRAND_RATE_LIMIT=20\n' "$DOMAIN" "$EMAIL" "$EMAIL" > .env
  echo "==> Wrote .env"
fi
# shellcheck disable=SC1091
source .env

SERVER_IP=$(curl -fsS https://api.ipify.org || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [[ -n "$SERVER_IP" && "$DNS_IP" != "$SERVER_IP" ]]; then
  echo "⚠  $DOMAIN points to '${DNS_IP:-nothing}', but this server is $SERVER_IP."
  echo "   Add a DNS A record ($DOMAIN -> $SERVER_IP). HTTPS will start working once it updates."
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
fi

echo "==> Building and starting (first build takes a few minutes)"
docker compose up -d --build
docker compose ps
echo
echo "✅ Dugout HQ is starting at https://$DOMAIN"
echo "   Admin console: https://$DOMAIN/admin  (sign in as $ADMIN_EMAILS)"
if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "   Email isn't set up yet, so your first sign-in link prints in the logs:"
  echo "   docker compose logs app | grep 'Sign in:' | tail -1"
fi
echo "   Logs:   docker compose logs -f"
echo "   Update: bash deploy/update.sh"
