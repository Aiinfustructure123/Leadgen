#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "Created .env.local — add DATABASE_URL before continuing."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && ! grep -q '^DATABASE_URL=.\+' .env.local; then
  echo "DATABASE_URL is missing in .env.local."
  echo "Run: npx create-db create"
  echo "Then paste the connection string into .env.local"
  exit 1
fi

npm install
npx prisma migrate deploy
npm run prisma:seed
npm run dev
