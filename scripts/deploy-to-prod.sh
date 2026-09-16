#!/usr/bin/env bash
# Deploy from this machine or GitHub Actions → production VPS (Traefik @ 185.211.4.81)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-185.211.4.81}"
DEPLOY_USER="${DEPLOY_USER:-root}"
REMOTE="${REMOTE:-${DEPLOY_USER}@${DEPLOY_HOST}}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/mailer}"
SKIP_ENV_SYNC="${SKIP_ENV_SYNC:-0}"

cd "$ROOT_DIR"

echo "==> Rsync → ${REMOTE}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .github \
  --exclude .output \
  --exclude .nuxt \
  --exclude dist \
  --exclude .env \
  --exclude .env.prod \
  --exclude 'backend/data' \
  --exclude 'mailserver/data' \
  --exclude '*.sqlite' \
  --exclude '*.sqlite-*' \
  "$ROOT_DIR/" "${REMOTE}:${REMOTE_DIR}/"

if [[ "$SKIP_ENV_SYNC" == "1" ]]; then
  echo "==> Skipping .env.prod sync (CI keeps the server file)"
  ssh "$REMOTE" "test -f ${REMOTE_DIR}/.env.prod"
elif [[ -f "$ROOT_DIR/.env.prod" ]]; then
  echo "==> Sync .env.prod (secrets)"
  rsync -az "$ROOT_DIR/.env.prod" "${REMOTE}:${REMOTE_DIR}/.env.prod"
elif ssh "$REMOTE" "test -f ${REMOTE_DIR}/.env.prod"; then
  echo "==> Keeping existing remote .env.prod"
else
  echo "ERROR: no .env.prod locally or on remote. Create one from .env.prod.example"
  exit 1
fi

echo "==> Remote deploy"
ssh "$REMOTE" "cd ${REMOTE_DIR} && chmod +x scripts/deploy.sh && ./scripts/deploy.sh"

echo "==> Smoke"
curl -fsS "https://mailing.aito-flow.com/api/health" || true
echo
curl -sI "https://mailing.aito-flow.com/" | head -8 || true
