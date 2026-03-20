#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# phish-squares Azure Deployment Script
#
# This script walks through the full deployment with pause
# points where Azure authentication is required.
#
# Usage:
#   chmod +x infra/deploy.sh
#   ./infra/deploy.sh
#
# Prerequisites:
#   - Azure CLI (az) installed
#   - Docker installed and running
#   - Node.js 22+ with npm
#   - GitHub CLI (gh) for Phase 6
# ─────────────────────────────────────────────────────────────

RESOURCE_GROUP="phishsquares-rg"
LOCATION="eastus2"
BASE_NAME="phishsquares"
ACR_NAME="${BASE_NAME}acr"
ENV_FILE=".env.azure"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
error() { echo -e "${RED}[❌]${NC} $1"; }
pause() {
  echo ""
  echo -e "${YELLOW}──────────────────────────────────────────${NC}"
  echo -e "${YELLOW}  PAUSED: $1${NC}"
  echo -e "${YELLOW}──────────────────────────────────────────${NC}"
  echo ""
  read -rp "Press ENTER when ready to continue (or Ctrl+C to abort)..."
  echo ""
}

save_env() {
  local key=$1 value=$2
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    info "Loaded existing $ENV_FILE"
  fi
}

# ─────────────────────────────────────────────────────────────
# Phase 0: Check prerequisites
# ─────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  phish-squares Azure Deployment"
echo "========================================"
echo ""

info "Checking prerequisites..."

command -v az >/dev/null 2>&1 || { error "Azure CLI (az) not found. Install: https://aka.ms/install-azure-cli"; exit 1; }
command -v docker >/dev/null 2>&1 || { error "Docker not found. Install Docker Desktop first."; exit 1; }
command -v node >/dev/null 2>&1 || { error "Node.js not found."; exit 1; }
command -v npx >/dev/null 2>&1 || { error "npx not found."; exit 1; }

ok "All prerequisites installed"

load_env

# ─────────────────────────────────────────────────────────────
# Phase 1: Azure Login & Resource Group
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 1: Azure Prerequisites ═══"

pause "Log into your Azure account now. Run: az login"

# Verify login
if ! az account show &>/dev/null; then
  error "Not logged into Azure. Run 'az login' first."
  exit 1
fi

TENANT_ID=$(az account show --query tenantId -o tsv)
SUB_NAME=$(az account show --query name -o tsv)
SUB_ID=$(az account show --query id -o tsv)
info "Tenant: $TENANT_ID"
info "Subscription: $SUB_NAME ($SUB_ID)"
save_env "AZURE_SUBSCRIPTION_ID" "$SUB_ID"
save_env "AZURE_TENANT_ID" "$TENANT_ID"

read -rp "Is this the correct subscription? (y/n): " confirm
[[ "$confirm" != "y" ]] && { warn "Run 'az account set --subscription <id>' to switch, then re-run."; exit 0; }

info "Creating resource group $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none
ok "Resource group created"

# Generate secrets if not already saved
if [[ -z "${DB_PASSWORD:-}" ]]; then
  DB_PASSWORD=$(openssl rand -base64 24)
  save_env "DB_PASSWORD" "$DB_PASSWORD"
  ok "Generated DB_PASSWORD"
else
  ok "DB_PASSWORD already exists in $ENV_FILE"
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET=$(openssl rand -base64 32)
  save_env "JWT_SECRET" "$JWT_SECRET"
  ok "Generated JWT_SECRET"
else
  ok "JWT_SECRET already exists in $ENV_FILE"
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo ""
  read -rp "Enter your Anthropic API key (or press ENTER to skip): " input_key
  ANTHROPIC_API_KEY="${input_key:-}"
  save_env "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
fi

ok "Phase 1 complete"

# ─────────────────────────────────────────────────────────────
# Phase 2: Deploy Bicep
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 2: Provision Infrastructure via Bicep ═══"
info "This will create: ACR, Container Apps, PostgreSQL, Key Vault, Log Analytics, App Insights"
info "Estimated time: 5-10 minutes"
echo ""

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json \
  --parameters \
    dbAdminPassword="$DB_PASSWORD" \
    jwtSecret="$JWT_SECRET" \
    anthropicApiKey="${ANTHROPIC_API_KEY:-}" \
  -o none

info "Capturing deployment outputs..."
OUTPUTS=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name main \
  --query properties.outputs -o json)

ACR_LOGIN_SERVER=$(echo "$OUTPUTS" | jq -r '.acrLoginServer.value')
API_URL=$(echo "$OUTPUTS" | jq -r '.apiUrl.value')
WEB_URL=$(echo "$OUTPUTS" | jq -r '.webUrl.value')
DB_HOST=$(echo "$OUTPUTS" | jq -r '.dbHost.value')
KV_NAME=$(echo "$OUTPUTS" | jq -r '.keyVaultName.value')

save_env "ACR_LOGIN_SERVER" "$ACR_LOGIN_SERVER"
save_env "API_URL" "$API_URL"
save_env "WEB_URL" "$WEB_URL"
save_env "DB_HOST" "$DB_HOST"
save_env "KV_NAME" "$KV_NAME"

ok "Phase 2 complete"
info "ACR:     $ACR_LOGIN_SERVER"
info "API URL: $API_URL"
info "Web URL: $WEB_URL"
info "DB Host: $DB_HOST"

# ─────────────────────────────────────────────────────────────
# Phase 3: Build and Push Container Images
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 3: Build and Push Container Images ═══"

az acr login --name "$ACR_NAME"

info "Building API image..."
docker build --target api \
  -t "${ACR_LOGIN_SERVER}/phish-squares-api:initial" .

info "Pushing API image..."
docker push "${ACR_LOGIN_SERVER}/phish-squares-api:initial"

info "Building Web image (VITE_API_URL=$API_URL)..."
docker build --target web \
  --build-arg "VITE_API_URL=$API_URL" \
  -t "${ACR_LOGIN_SERVER}/phish-squares-web:initial" .

info "Pushing Web image..."
docker push "${ACR_LOGIN_SERVER}/phish-squares-web:initial"

ok "Phase 3 complete — both images pushed to ACR"

# ─────────────────────────────────────────────────────────────
# Phase 4: Database Migration
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 4: Database Migration ═══"

MY_IP=$(curl -s ifconfig.me)
info "Adding firewall rule for local IP: $MY_IP"
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "${BASE_NAME}-db" \
  --rule-name local-deploy \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP" \
  -o none

DATABASE_URL="postgresql://psqladmin:${DB_PASSWORD}@${DB_HOST}:5432/phishsquares?sslmode=require"

info "Running Prisma migrations..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

info "Seeding songs..."
DATABASE_URL="$DATABASE_URL" npx tsx apps/api/prisma/seed-songs.ts || warn "Song seed failed (may already be seeded)"

info "Removing firewall rule..."
az postgres flexible-server firewall-rule delete \
  --resource-group "$RESOURCE_GROUP" \
  --name "${BASE_NAME}-db" \
  --rule-name local-deploy \
  --yes \
  -o none

ok "Phase 4 complete — database migrated and seeded"

# ─────────────────────────────────────────────────────────────
# Phase 5: Update Container Apps with Real Images
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 5: Update Container Apps with Real Images ═══"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json \
  --parameters \
    dbAdminPassword="$DB_PASSWORD" \
    jwtSecret="$JWT_SECRET" \
    anthropicApiKey="${ANTHROPIC_API_KEY:-}" \
    apiContainerImage="${ACR_LOGIN_SERVER}/phish-squares-api:initial" \
    webContainerImage="${ACR_LOGIN_SERVER}/phish-squares-web:initial" \
  -o none

info "Waiting for API to become healthy..."
sleep 15

API_HEALTH=$(curl -sf "${API_URL}/api/health" 2>/dev/null || echo '{"status":"unreachable"}')
info "API health: $API_HEALTH"

ok "Phase 5 complete"
echo ""
info "🎸 Your app is live!"
info "   API: $API_URL"
info "   Web: $WEB_URL"

# ─────────────────────────────────────────────────────────────
# Phase 6: Wire GitHub Actions (manual)
# ─────────────────────────────────────────────────────────────
echo ""
info "═══ Phase 6: GitHub Actions Secrets ═══"
info "This phase creates a service principal and sets GitHub secrets."
echo ""

read -rp "Set up CI/CD now? (y/n): " setup_cicd

if [[ "$setup_cicd" == "y" ]]; then
  info "Creating service principal..."
  SP_JSON=$(az ad sp create-for-rbac --name "phishsquares-github" \
    --role contributor \
    --scopes "/subscriptions/${SUB_ID}/resourceGroups/${RESOURCE_GROUP}" \
    --json-auth 2>/dev/null)

  ACR_CREDS=$(az acr credential show --name "$ACR_NAME" -o json)
  ACR_USERNAME=$(echo "$ACR_CREDS" | jq -r '.username')
  ACR_PASSWORD=$(echo "$ACR_CREDS" | jq -r '.passwords[0].value')

  if command -v gh >/dev/null 2>&1; then
    info "Setting GitHub secrets via gh CLI..."
    gh secret set AZURE_CREDENTIALS --body "$SP_JSON"
    gh secret set AZURE_CONTAINER_REGISTRY --body "$ACR_LOGIN_SERVER"
    gh secret set AZURE_RESOURCE_GROUP --body "$RESOURCE_GROUP"
    gh secret set ACR_NAME --body "$ACR_NAME"
    gh secret set ACR_USERNAME --body "$ACR_USERNAME"
    gh secret set ACR_PASSWORD --body "$ACR_PASSWORD"
    gh secret set DATABASE_URL --body "postgresql://psqladmin:${DB_PASSWORD}@${DB_HOST}:5432/phishsquares?sslmode=require"
    gh secret set API_URL --body "$API_URL"
    ok "All 8 GitHub secrets set"
  else
    warn "GitHub CLI (gh) not found. Set these secrets manually in GitHub repo settings:"
    echo ""
    echo "  AZURE_CREDENTIALS       = <service principal JSON above>"
    echo "  AZURE_CONTAINER_REGISTRY = $ACR_LOGIN_SERVER"
    echo "  AZURE_RESOURCE_GROUP     = $RESOURCE_GROUP"
    echo "  ACR_NAME                 = $ACR_NAME"
    echo "  ACR_USERNAME             = $ACR_USERNAME"
    echo "  ACR_PASSWORD             = $ACR_PASSWORD"
    echo "  DATABASE_URL             = postgresql://psqladmin:${DB_PASSWORD}@${DB_HOST}:5432/phishsquares?sslmode=require"
    echo "  API_URL                  = $API_URL"
    echo ""
  fi
  ok "Phase 6 complete"
else
  warn "Skipping CI/CD setup. Re-run this script or follow issue #46 manually."
fi

# ─────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo -e "  ${GREEN}Deployment Complete!${NC}"
echo "========================================"
echo ""
echo "  API: $API_URL"
echo "  Web: $WEB_URL"
echo ""
echo "  Next steps:"
echo "    1. Open $WEB_URL and register a user"
echo "    2. Create a game and test the draft flow"
echo "    3. Push to main to trigger CI/CD (if Phase 6 completed)"
echo ""
echo "  Saved config: $ENV_FILE"
echo "  Issues: https://github.com/Moose0621/phish-squares/issues"
echo ""
