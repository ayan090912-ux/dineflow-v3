#!/usr/bin/env bash
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${REPO_ROOT}/backend/dineflow-backend/.venv/bin/python"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "[ERROR] Backend virtual environment python not found at ${VENV_PYTHON}"
  exit 1
fi

"${VENV_PYTHON}" "${REPO_ROOT}/scripts/deploy_prod.py" "$@"
