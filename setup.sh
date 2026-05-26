#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()    { echo -e "${GREEN}[setup]${NC} $1"; }
warn()  { echo -e "${YELLOW}[setup]${NC} $1"; }
fail()  { echo -e "${RED}[setup]${NC} $1"; exit 1; }

USE_DOCKER=true
for arg in "$@"; do [ "$arg" = "--no-docker" ] && USE_DOCKER=false; done

info "=== Remix Message Flow — Setup ==="

# ── Check prerequisites ──
HAS_NODE=false; HAS_DOCKER=false; HAS_PSQL=false
command -v node  >/dev/null 2>&1 && HAS_NODE=true
command -v docker >/dev/null 2>&1 && HAS_DOCKER=true
command -v psql  >/dev/null 2>&1 && HAS_PSQL=true

if ! $HAS_NODE; then
  fail "Node.js não encontrado. Instale Node.js 18+ (https://nodejs.org)"
fi

if $USE_DOCKER && ! $HAS_DOCKER; then
  warn "Docker não encontrado. Tentando modo --no-docker (PostgreSQL direto)..."
  USE_DOCKER=false
fi

if ! $USE_DOCKER && ! $HAS_PSQL; then
  fail "PostgreSQL (psql) não encontrado. Instale PostgreSQL ou Docker."
fi

# ── Project root ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Create .env if missing ──
if [ ! -f server/.env ]; then
  info "Criando server/.env..."
  cp server/.env.example server/.env
  # Generate random JWT_SECRET
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^# JWT_SECRET=/JWT_SECRET=$JWT_SECRET/" server/.env
  else
    sed -i "s/^# JWT_SECRET=/JWT_SECRET=$JWT_SECRET/" server/.env
  fi
  ok "server/.env criado com JWT_SECRET aleatório"
else
  ok "server/.env já existe"
fi

# ── Install dependencies ──
info "Instalando dependências do servidor..."
cd server
npm install --silent
cd ..

# ── Build frontend ──
info "Compilando frontend..."
npm run build --silent
ok "Frontend compilado"

# ── Start database ──
if $USE_DOCKER; then
  info "Iniciando PostgreSQL via Docker..."
  docker compose up -d postgres
  warn "Aguardando PostgreSQL ficar pronto..."
  until docker exec remix-postgres pg_isready -U remix >/dev/null 2>&1; do sleep 2; done
  ok "PostgreSQL pronto"
else
  info "Configurando PostgreSQL direto..."
  # Source .env for PG vars
  set -a; source server/.env; set +a
  createdb -U "$PG_USER" "$PG_DATABASE" 2>/dev/null || true
  psql -U "$PG_USER" -d "$PG_DATABASE" -f server/db/schema.sql -q 2>/dev/null || true
  ok "PostgreSQL configurado"
fi

# ── Always rebuild the full docker app if using docker ──
if $USE_DOCKER; then
  info "Construindo e iniciando o app (Docker)..."
  docker compose up -d --build app
  PORT=${PORT:-3000}
  ok "App rodando em http://localhost:$PORT"
else
  info "Iniciando servidor Node..."
  PORT=${PORT:-3000}
  node server/index.js &
  ok "App rodando em http://localhost:$PORT (PID $!)"
fi

info "=== Setup concluído ==="
