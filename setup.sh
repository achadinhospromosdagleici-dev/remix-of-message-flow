#!/usr/bin/env bash
set -u
set -o pipefail

# ═══════════════════════════════════════════════════════════════
#  Remix Message Flow — Instalador Automático
#  Uso: chmod +x setup.sh && ./setup.sh
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()    { echo -e "${GREEN}[setup]${NC} $1"; }
warn()  { echo -e "${YELLOW}[setup]${NC} $1"; }
fail()  { echo -e "${RED}[setup]${NC} $1"; exit 1; }

# ── Error trap: não deixa o terminal fechar sem aviso ──
on_exit() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo -e "${RED}[setup] Erro inesperado (código $exit_code)${NC}"
    echo -e "${YELLOW}Verifique: Docker Desktop rodando? Node.js instalado?${NC}"
    echo -e "${YELLOW}Requisitos: https://nodejs.org + https://docs.docker.com/desktop/${NC}"
    read -p "Pressione Enter para fechar..." </dev/tty 2>/dev/null || true
  fi
}
trap on_exit EXIT

# ── Detect OS ──
OS=""; OS_LIKE=""
if [ -f /etc/os-release ]; then
  . /etc/os-release; OS="$ID"; OS_LIKE="$ID_LIKE"
fi

IS_LINUX=false; IS_MAC=false; IS_WINDOWS=false
case "$(uname -s)" in
  Linux*)  IS_LINUX=true ;;
  Darwin*) IS_MAC=true ;;
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=true ;;
esac

# ── Docker compose command (plugin ou legacy) ──
DOCKER_COMPOSE="docker compose"
if ! docker compose version &>/dev/null && docker-compose version &>/dev/null; then
  DOCKER_COMPOSE="docker-compose"
fi

# ── Banner ──
command -v clear &>/dev/null && clear
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║     Remix Message Flow — Instalador      ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── Mode selection ──
echo "Escolha o modo de instalação:"
echo ""
echo "  1) DESENVOLVIMENTO — Local (Docker + npm run dev)"
echo "  2) PRODUÇÃO — VPS completa (Docker + Nginx + SSL)"
echo ""
read -p "$(echo -e ${CYAN}[setup]${NC} Digite 1 ou 2: )" MODE
echo ""

case "$MODE" in
  1) MODE="dev" ;;
  2) MODE="prod" ;;
  *) fail "Opção inválida" ;;
esac

# ── Project root ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════

check_command() {
  if ! command -v "$1" &>/dev/null; then
    return 1
  fi
  return 0
}

install_docker() {
  if check_command docker; then
    ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') já instalado"
    return 0
  fi
  if $IS_LINUX; then
    info "Instalando Docker..."
    curl -fsSL https://get.docker.com | bash
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    ok "Docker instalado"
  else
    fail "Docker não encontrado. Instale Docker Desktop manualmente: https://docs.docker.com/desktop/"
  fi
}

install_node() {
  if check_command node; then
    local NODE_VER NODE_MAJOR
    NODE_VER=$(node --version 2>&1)
    NODE_VER="${NODE_VER//$'\r'/}"
    NODE_VER="${NODE_VER//$'\n'/}"
    NODE_VER="${NODE_VER#v}"
    NODE_MAJOR="${NODE_VER%%.*}"
    if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
      ok "Node.js v$NODE_VER já instalado"
    else
      warn "Node.js v$NODE_VER detectado, mas versão 18+ é recomendada"
    fi
    return 0
  fi
  if $IS_LINUX; then
    info "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
    ok "Node.js $(node -v) instalado"
  elif $IS_MAC; then
    if check_command brew; then
      brew install node@20
    else
      fail "Instale Homebrew (https://brew.sh) ou Node.js 20+ manualmente"
    fi
  else
    fail "Instale Node.js 20+ manualmente: https://nodejs.org"
  fi
}

setup_env() {
  if [ -f server/.env ]; then
    ok "server/.env já existe"
    return
  fi
  info "Criando server/.env..."
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > server/.env << EOF
PORT=3000
JWT_SECRET=$JWT_SECRET
PG_HOST=${PG_HOST:-localhost}
PG_PORT=5432
PG_USER=remix
PG_PASSWORD=${PG_PASSWORD:-remix123}
PG_DATABASE=remix
UPLOAD_DIR=./uploads
EOF
  ok "server/.env criado com JWT_SECRET aleatório"
}

# ═══════════════════════════════════════════════════════════════
#  WHATSAPP API — Instalação Opcional
# ═══════════════════════════════════════════════════════════════

install_whatsapp_api() {
  echo ""
  echo -e -n "${CYAN}[setup]${NC} Deseja instalar uma API WhatsApp? (s/N): "
  read INSTALL_WA
  [[ "$INSTALL_WA" != "s" && "$INSTALL_WA" != "S" ]] && return

  echo ""
  echo "APIs disponíveis:"
  echo "  1) Evolution API  → Container único, SQLite (recomendada)"
  echo "  2) Evolution Go   → Requer PostgreSQL (2 databases extras)"
  echo "  3) UnoAPI         → Requer Redis (instalado junto)"
  echo "  4) WuzAPI         → Container único, SQLite"
  echo "  0) Pular"
  echo ""
  echo -e -n "${CYAN}[setup]${NC} Escolha (0-4): "
  read WA_CHOICE
  echo ""

  case "$WA_CHOICE" in
    1) install_evolution_api ;;
    2) install_evolution_go ;;
    3) install_unoapi ;;
    4) install_wuzapi ;;
    *) info "Nenhuma API instalada"; return ;;
  esac

  # ── Save credentials ──
  info "Credenciais da API salvas"
}

update_nginx_for_api() {
  local LOCATION="$1"
  local PROXY_DEST="$2"
  if [ "$MODE" != "prod" ]; then return; fi
  if [ ! -f nginx.conf ]; then return; fi
  # Remove last line (}), append location block, close server block
  sed -i '$d' nginx.conf
  cat >> nginx.conf << NGINX
    $LOCATION
        rewrite ^${LOCATION%/}(/.*)$ \$1 break;
        proxy_pass $PROXY_DEST;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

}
NGINX
  $DOCKER_COMPOSE -f docker-compose.prod.yml exec -T nginx nginx -s reload 2>/dev/null || true
}

install_evolution_api() {
  local API_KEY
  API_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  info "Gerando chave Evolution API..."

  export EVOLUTION_API_KEY="$API_KEY"
  if [ "$MODE" = "prod" ]; then
    export EVOLUTION_SERVER_URL="https://$DOMAIN/evolution"
  else
    export EVOLUTION_SERVER_URL="http://localhost:8080"
  fi

  # Salva para persistência
  grep -q '^EVOLUTION_API_KEY=' .env.whatsapp 2>/dev/null && \
    sed -i "s/^EVOLUTION_API_KEY=.*$/EVOLUTION_API_KEY=$API_KEY/" .env.whatsapp || \
    echo "EVOLUTION_API_KEY=$API_KEY" >> .env.whatsapp

  if ! $DOCKER_COMPOSE --profile evolution -f docker-compose.whatsapp.yml up -d; then
    warn "Falha ao iniciar Evolution API. Verifique o Docker."
    return 1
  fi

  update_nginx_for_api "/evolution/" "http://evolution-api:8080"
  ok "Evolution API instalada (porta 8080)"
  info "API Key: $API_KEY"
  info "Configure no painel → Settings → Evolution API"
}

install_evolution_go() {
  local API_KEY
  API_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  info "Gerando chave Evolution Go..."

  export EVOLUTION_GO_API_KEY="$API_KEY"

  # Em dev, PostgreSQL roda no host — precisa apontar para host.docker.internal
  if [ "$MODE" = "dev" ]; then
    export PG_HOST="host.docker.internal"
  fi
  # Em prod, PG_PASSWORD está na variável do script
  if [ "$MODE" = "prod" ]; then
    export PG_PASSWORD
  fi

  # Salva para persistência
  grep -q '^EVOLUTION_GO_API_KEY=' .env.whatsapp 2>/dev/null && \
    sed -i "s/^EVOLUTION_GO_API_KEY=.*$/EVOLUTION_GO_API_KEY=$API_KEY/" .env.whatsapp || \
    echo "EVOLUTION_GO_API_KEY=$API_KEY" >> .env.whatsapp

  # Criar databases extras
  for DB in evogo_auth evogo_users; do
    if docker exec -i remix-postgres psql -U remix -lqt 2>/dev/null | grep -q "$DB"; then
      ok "Database $DB já existe"
    else
      info "Criando database $DB..."
      docker exec -i remix-postgres createdb -U remix "$DB" 2>/dev/null || true
    fi
  done

  if ! $DOCKER_COMPOSE --profile evolution-go -f docker-compose.whatsapp.yml up -d; then
    warn "Falha ao iniciar Evolution Go. Verifique o Docker."
    return 1
  fi

  update_nginx_for_api "/evolution-go/" "http://evolution-go:8080"
  ok "Evolution Go instalada (porta 8081)"
  info "API Key: $API_KEY"
  info "Configure no painel → Settings → Evolution Go"
}

install_unoapi() {
  local API_KEY
  API_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  info "Gerando chave UnoAPI..."

  export UNOAPI_API_KEY="$API_KEY"

  grep -q '^UNOAPI_API_KEY=' .env.whatsapp 2>/dev/null && \
    sed -i "s/^UNOAPI_API_KEY=.*$/UNOAPI_API_KEY=$API_KEY/" .env.whatsapp || \
    echo "UNOAPI_API_KEY=$API_KEY" >> .env.whatsapp

  if ! $DOCKER_COMPOSE --profile unoapi -f docker-compose.whatsapp.yml up -d; then
    warn "Falha ao iniciar UnoAPI. Verifique o Docker."
    return 1
  fi

  update_nginx_for_api "/unoapi/" "http://unoapi:9876"
  ok "UnoAPI instalada (porta 9876) com Redis"
  info "API Token: $API_KEY"
  info "Configure no painel → Settings → UnoAPI"
}

install_wuzapi() {
  local ADMIN_TOKEN
  ADMIN_TOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  info "Gerando admin token WuzAPI..."

  export WUZAPI_ADMIN_TOKEN="$ADMIN_TOKEN"

  grep -q '^WUZAPI_ADMIN_TOKEN=' .env.whatsapp 2>/dev/null && \
    sed -i "s/^WUZAPI_ADMIN_TOKEN=.*$/WUZAPI_ADMIN_TOKEN=$ADMIN_TOKEN/" .env.whatsapp || \
    echo "WUZAPI_ADMIN_TOKEN=$ADMIN_TOKEN" >> .env.whatsapp

  if ! $DOCKER_COMPOSE --profile wuzapi -f docker-compose.whatsapp.yml up -d; then
    warn "Falha ao iniciar WuzAPI. Verifique o Docker."
    return 1
  fi

  update_nginx_for_api "/wuzapi/" "http://wuzapi:8080"
  ok "WuzAPI instalada (porta 8082)"
  info "Admin Token: $ADMIN_TOKEN"
  info "Configure no painel → Settings → WuzAPI"
}

# ═══════════════════════════════════════════════════════════════
#  MODO DESENVOLVIMENTO
# ═══════════════════════════════════════════════════════════════

if [ "$MODE" = "dev" ]; then
  echo -e "${BOLD}═══ Modo DESENVOLVIMENTO ═══${NC}"
  echo ""

  # ── Pre-requisitos ──
  install_docker
  install_node

  # ── .env ──
  setup_env

  # ── Dependências npm ──
  info "Instalando dependências..."
  npm install --silent 2>/dev/null || true
  (cd server && npm install --silent 2>/dev/null || true)
  ok "Dependências instaladas"

  # ── PostgreSQL via Docker ──
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^remix-postgres$'; then
    ok "PostgreSQL já está rodando"
  else
    info "Iniciando PostgreSQL..."
    $DOCKER_COMPOSE up -d postgres
    info "Aguardando PostgreSQL ficar pronto..."
    for i in $(seq 1 30); do
      if docker exec -i remix-postgres pg_isready -U remix &>/dev/null; then
        ok "PostgreSQL pronto"
        break
      fi
      sleep 2
    done
  fi

  # ── Optional WhatsApp API ──
  install_whatsapp_api

  # ── Pronto ──
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Dev pronto!                                 ║${NC}"
  echo -e "${GREEN}║                                                ║${NC}"
  echo -e "${GREEN}║  Frontend:  ${CYAN}http://localhost:5173${GREEN}               ║${NC}"
  echo -e "${GREEN}║  API:       ${CYAN}http://localhost:3000${GREEN}                ║${NC}"
  echo -e "${GREEN}║                                                ║${NC}"
  echo -e "${GREEN}║  Pressione Ctrl+C para parar                   ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  npm run dev
  echo ""
  read -p "Pressione Enter para fechar..."
fi

# ═══════════════════════════════════════════════════════════════
#  MODO PRODUÇÃO
# ═══════════════════════════════════════════════════════════════

echo -e "${BOLD}═══ Modo PRODUÇÃO ═══${NC}"
echo ""

# ── Root check ──
if [ "$(id -u)" -ne 0 ]; then
  fail "Modo produção requer execução como root. Use: sudo ./setup.sh"
fi

# ── OS check ──
if ! $IS_LINUX; then
  fail "Modo produção requer Linux (Ubuntu/Debian)"
fi
if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]] && [[ "$OS_LIKE" != *"debian"* && "$OS_LIKE" != *"ubuntu"* ]]; then
  warn "Sistema: $OS $OS_LIKE — recomendado Ubuntu 22.04+ ou Debian 12+"
  read -p "Continuar mesmo assim? (s/N): " CONFIRM
  if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
    echo "Abortando."
    exit 1
  fi
fi

# ── Domain input ──
read -p "Domínio (ex: meudominio.com): " DOMAIN
[[ -z "$DOMAIN" ]] && fail "Domínio é obrigatório"

read -p "Email para Let's Encrypt: " EMAIL
[[ -z "$EMAIL" ]] && fail "Email é obrigatório"

# ── Generate secrets ──
PG_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo ""
info "Senhas geradas:"
info "  PG_PASSWORD: $PG_PASSWORD"
info "  JWT_SECRET:  $JWT_SECRET"
echo ""

# ── System update ──
info "Atualizando sistema..."
apt-get update -qq

# ── Install Docker ──
install_docker

# ── Install Node.js ──
install_node

# ── Install system packages ──
info "Instalando nginx + certbot + ufw..."
apt-get install -y -qq nginx certbot python3-certbot-nginx ufw
ok "nginx, certbot e ufw instalados"

# ── Firewall ──
info "Configurando firewall (UFW)..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw allow 80/tcp   >/dev/null 2>&1
ufw allow 443/tcp  >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1
ok "Firewall configurado (portas 80, 443 abertas)"

# ── Create .env ──
setup_env
# Override PG_HOST for Docker networking
if grep -q '^PG_HOST=' server/.env; then
  sed -i "s/^PG_HOST=.*$/PG_HOST=postgres/" server/.env
else
  echo "PG_HOST=postgres" >> server/.env
fi
if grep -q '^PG_PASSWORD=' server/.env; then
  sed -i "s/^PG_PASSWORD=.*$/PG_PASSWORD=$PG_PASSWORD/" server/.env
fi
if grep -q '^JWT_SECRET=' server/.env; then
  sed -i "s/^JWT_SECRET=.*$/JWT_SECRET=$JWT_SECRET/" server/.env
fi
ok "server/.env configurado para produção"

# ── npm dependencies ──
info "Instalando dependências npm..."
npm install --silent 2>/dev/null || true
(cd server && npm install --silent 2>/dev/null || true)
ok "Dependências instaladas"

# ── Build frontend ──
info "Compilando frontend..."
npm run build
ok "Frontend compilado"

# ── Create nginx conf dir ──
mkdir -p /etc/nginx 2>/dev/null || true

# ── Stop any existing Docker containers ──
$DOCKER_COMPOSE -f docker-compose.prod.yml down 2>/dev/null || true

# ── Get SSL certificate (standalone — needs port 80 temporarily) ──
info "Obtendo certificado SSL para $DOMAIN..."
systemctl stop nginx 2>/dev/null || true
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" || {
  warn "Certbot standalone falhou. Tentando via webroot..."
  systemctl start nginx 2>/dev/null || true
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" || {
    warn "Certbot webroot falhou. A instalação continuará sem SSL."
    warn "Execute manualmente depois: certbot --nginx -d $DOMAIN"
    SSL_OK=false
  }
}
systemctl start nginx 2>/dev/null || true
SSL_OK=${SSL_OK:-true}

# ── SSL auto-renovação ──
if $SSL_OK && command -v crontab &>/dev/null; then
  (crontab -l 2>/dev/null | grep -q "certbot renew" || echo "0 3 * * * certbot renew --quiet && $DOCKER_COMPOSE -f $SCRIPT_DIR/docker-compose.prod.yml exec -T nginx nginx -s reload 2>/dev/null || true" | crontab -)
  ok "Auto-renovação SSL configurada (cron: 3:00 AM)"
fi

# ── Generate production nginx.conf with SSL ──
info "Gerando nginx.conf com SSL..."
if $SSL_OK && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  cat > nginx.conf << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
else
  cat > nginx.conf << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
fi
ok "nginx.conf gerado"

# ── Stop host nginx (Docker nginx vai usar porta 80/443) ──
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true

# ── Start Docker containers ──
info "Iniciando containers Docker..."
$DOCKER_COMPOSE -f docker-compose.prod.yml up -d
ok "Containers iniciados"

# ── Wait for app health ──
info "Aguardando aplicação responder..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/api/health >/dev/null 2>&1; then
    ok "Aplicação respondendo na porta 80"
    break
  fi
  sleep 2
done

# ── Save credentials ──
CRED_FILE="/root/.remix-credentials.txt"
cat > "$CRED_FILE" << CRED
╔══════════════════════════════════════════╗
║  Remix Message Flow — Credenciais       ║
╚══════════════════════════════════════════╝

📅  Instalação: $(date)
📍  URL:         https://$DOMAIN

🗄️  PostgreSQL:
   Host:     localhost
   Porta:    5432
   Usuário:  remix
   Senha:    $PG_PASSWORD
   Database: remix

🔑  JWT Secret: $JWT_SECRET

📁  Diretório:  $SCRIPT_DIR

🔄  Renovação SSL: automática (cron 3:00 AM)

⚠️  Guarde estas informações em local seguro!
CRED
chmod 600 "$CRED_FILE"
ok "Credenciais salvas em $CRED_FILE"

# ── Optional WhatsApp API ──
export PG_PASSWORD
install_whatsapp_api

# ── Pronto ──
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ PRODUÇÃO PRONTA!                                ║${NC}"
echo -e "${GREEN}║                                                    ║${NC}"
echo -e "${GREEN}║  📍 ${CYAN}https://$DOMAIN${GREEN}                              ║${NC}"
echo -e "${GREEN}║                                                    ║${NC}"
echo -e "${GREEN}║  Credenciais: ${YELLOW}$CRED_FILE${GREEN}                 ║${NC}"
echo -e "${GREEN}║                                                    ║${NC}"
echo -e "${GREEN}║  Comandos úteis:                                   ║${NC}"
echo -e "${GREEN}║  $DOCKER_COMPOSE -f docker-compose.prod.yml logs -f ║${NC}"
echo -e "${GREEN}║  $DOCKER_COMPOSE -f docker-compose.prod.yml restart ║${NC}"
echo -e "${GREEN}║                                                    ║${NC}"
echo -e "${GREEN}║  ⚙️  Configure sua API WhatsApp nas Configurações   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
