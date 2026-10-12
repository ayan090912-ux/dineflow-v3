#!/usr/bin/env bash
# ==============================================================================
# Dinely — Local macOS Development Stack Launcher
# ==============================================================================
# Starts FastAPI backend (port 8000) and Vite frontend (port 3007) locally
# with graceful shutdown (Ctrl+C). Safe: isolated from production.
# ==============================================================================

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend/dineflow-backend"
FRONTEND_DIR="${REPO_ROOT}/frontend"
VENV_BIN="${BACKEND_DIR}/.venv/bin"

# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "=========================================================="
echo "          🍽️   DINELY LOCAL DEV STACK (macOS)             "
echo "=========================================================="
echo -e "${NC}"

# 1. Environment & Platform Checks
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo -e "${YELLOW}[!] Warning: This script is tailored for macOS, but running on $(uname -s). Proceeding...${NC}"
fi

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
  exit 1
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] npm is not installed or not in PATH.${NC}"
  exit 1
fi

# Check Python 3
if ! command -v python3 >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] python3 is not installed or not in PATH.${NC}"
  exit 1
fi

# 2. Check Virtual Environment & Dependencies
if [[ ! -x "${VENV_BIN}/python" ]] || [[ ! -x "${VENV_BIN}/uvicorn" ]]; then
  echo -e "${YELLOW}[!] Backend virtual environment missing or incomplete at:${NC}"
  echo "    ${BACKEND_DIR}/.venv"
  echo -e "    Run setup: python3 -m venv ${BACKEND_DIR}/.venv && ${VENV_BIN}/pip install -r ${BACKEND_DIR}/requirements.txt"
  exit 1
fi

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
  echo -e "${YELLOW}[!] Frontend dependencies missing at:${NC}"
  echo "    ${FRONTEND_DIR}/node_modules"
  echo -e "    Run: cd ${FRONTEND_DIR} && npm ci"
  exit 1
fi

# 3. Check Local Environment Files (.env)
if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  if [[ -f "${BACKEND_DIR}/.env.example" ]]; then
    echo -e "${YELLOW}[i] Creating backend .env from .env.example...${NC}"
    cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
  else
    echo -e "${RED}[ERROR] Missing ${BACKEND_DIR}/.env and no .env.example found.${NC}"
    exit 1
  fi
fi

if [[ ! -f "${FRONTEND_DIR}/.env" ]]; then
  if [[ -f "${FRONTEND_DIR}/.env.example" ]]; then
    echo -e "${YELLOW}[i] Creating frontend .env from .env.example...${NC}"
    cp "${FRONTEND_DIR}/.env.example" "${FRONTEND_DIR}/.env"
  else
    echo -e "${RED}[ERROR] Missing ${FRONTEND_DIR}/.env and no .env.example found.${NC}"
    exit 1
  fi
fi

# 4. Check & Seed Local Database
DB_FILE="${BACKEND_DIR}/dineflow_dev.db"
if [[ ! -f "${DB_FILE}" ]]; then
  echo -e "${CYAN}[i] Local dev SQLite database not found. Seeding initial development data...${NC}"
  "${VENV_BIN}/python" "${REPO_ROOT}/scripts/seed_dev_database.py"
fi

# 5. Check Ports (Avoid clashing or orphaned instances)
BACKEND_PID=""
FRONTEND_PID=""

check_port() {
  local port=$1
  lsof -i ":${port}" -sTCP:LISTEN -t 2>/dev/null || true
}

EXISTING_BACKEND_PID=$(check_port 8000)
EXISTING_FRONTEND_PID=$(check_port 3007)

if [[ -n "${EXISTING_BACKEND_PID}" ]]; then
  echo -e "${YELLOW}[!] Port 8000 is already in use (PID: ${EXISTING_BACKEND_PID}).${NC}"
  echo -e "    Verifying if existing server responds..."
  if curl -s "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo -e "    ${GREEN}✓ Backend is already running healthy.${NC}"
  else
    echo -e "    ${RED}Port 8000 is occupied by an unresponsive process. Please stop PID ${EXISTING_BACKEND_PID} before restarting.${NC}"
    exit 1
  fi
fi

if [[ -n "${EXISTING_FRONTEND_PID}" ]]; then
  echo -e "${YELLOW}[!] Port 3007 is already in use (PID: ${EXISTING_FRONTEND_PID}).${NC}"
  echo -e "    Verifying if existing server responds..."
  if curl -s "http://localhost:3007/" >/dev/null 2>&1; then
    echo -e "    ${GREEN}✓ Frontend is already running healthy.${NC}"
  else
    echo -e "    ${RED}Port 3007 is occupied by an unresponsive process. Please stop PID ${EXISTING_FRONTEND_PID} before restarting.${NC}"
    exit 1
  fi
fi

# Graceful termination handler
cleanup() {
  echo -e "\n${YELLOW}[i] Shutting down Dinely local dev stack...${NC}"
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo -e "    Stopping Backend (PID ${BACKEND_PID})..."
    kill -TERM "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    echo -e "    Stopping Frontend (PID ${FRONTEND_PID})..."
    kill -TERM "${FRONTEND_PID}" 2>/dev/null || true
  fi
  wait "${BACKEND_PID}" 2>/dev/null || true
  wait "${FRONTEND_PID}" 2>/dev/null || true
  echo -e "${GREEN}✓ Local stack stopped cleanly.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start Backend if not already running
if [[ -z "${EXISTING_BACKEND_PID}" ]]; then
  echo -e "${CYAN}[*] Starting Backend server (FastAPI on http://127.0.0.1:8000)...${NC}"
  (cd "${BACKEND_DIR}" && "${VENV_BIN}/uvicorn" app.main:app --host 127.0.0.1 --port 8000 --reload) &
  BACKEND_PID=$!
  sleep 2
fi

# Start Frontend if not already running
if [[ -z "${EXISTING_FRONTEND_PID}" ]]; then
  echo -e "${CYAN}[*] Starting Frontend server (Vite on http://localhost:3007)...${NC}"
  (cd "${FRONTEND_DIR}" && npm run dev) &
  FRONTEND_PID=$!
  sleep 2
fi

echo -e "\n${GREEN}${BOLD}=========================================================="
echo "          ✨ DINELY LOCAL DEV STACK IS ACTIVE ✨          "
echo -e "==========================================================${NC}"
echo -e "  ${BOLD}Landing Page:${NC}       http://localhost:3007/"
echo -e "  ${BOLD}Staff Login:${NC}        http://localhost:3007/staff/login"
echo -e "  ${BOLD}Waiter Terminal:${NC}    http://localhost:3007/waiter"
echo -e "  ${BOLD}Kitchen Terminal:${NC}   http://localhost:3007/kitchen"
echo -e "  ${BOLD}Bar Terminal:${NC}       http://localhost:3007/bar"
echo -e "  ${BOLD}Inventory Terminal:${NC} http://localhost:3007/inventory"
echo -e "  ${BOLD}Customer QR Menu:${NC}   http://localhost:3007/customer"
echo -e "  ${BOLD}Backend API Docs:${NC}   http://127.0.0.1:8000/docs"
echo -e "  ${BOLD}Health Endpoint:${NC}    http://127.0.0.1:8000/health"
echo "----------------------------------------------------------"
echo -e "  ${BOLD}Dev Staff Credentials (Password: dinely123):${NC}"
echo "    - Waiter:    waiter1"
echo "    - Kitchen:   kitchen1"
echo "    - Bar:       bar1"
echo "    - Inventory: inventory1"
echo "=========================================================="
echo -e "${CYAN}Press Ctrl+C to stop servers gracefully.${NC}\n"

# Wait for both processes
if [[ -n "${BACKEND_PID}" ]] || [[ -n "${FRONTEND_PID}" ]]; then
  wait
else
  echo -e "${GREEN}Servers are running in background.${NC}"
fi
