#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/studyme/lms"
REPO="$ROOT/repo"
WEB_DEST="/var/www/studyme"
BRANCH="main"

cd "$ROOT"

echo "==> Pulling latest code ($BRANCH)..."
cd "$REPO"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git log -1 --oneline

echo "==> Building SPA in Docker..."
docker build -f frontend/web/Dockerfile -t studyme-web-build frontend/web

echo "==> Extracting built SPA from image..."
CID=$(docker create studyme-web-build)
rm -rf /tmp/studyme-dist
docker cp "$CID":/out /tmp/studyme-dist
docker rm "$CID"

echo "==> Publishing SPA to $WEB_DEST..."
sudo mkdir -p "$WEB_DEST"
sudo rsync -a --delete /tmp/studyme-dist/ "$WEB_DEST"/
rm -rf /tmp/studyme-dist

echo "==> Rebuilding and restarting API container..."
cd "$ROOT"
docker compose up -d --build api

echo "==> Pruning dangling images..."
docker image prune -f

echo "==> Done. Containers:"
docker compose ps


# DELETE FROM enrollments WHERE student_id IN (SELECT id FROM students WHERE admission_number LIKE 'KRB-2627-%'); DELETE FROM students WHERE admission_number LIKE 'KRB-2627-%';