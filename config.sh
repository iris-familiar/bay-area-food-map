#!/bin/bash
# Bay Area Food Map — Project Configuration
# Source this file in all pipeline scripts: source "$(dirname "$0")/../config.sh"

export PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DB_FILE="${PROJECT_ROOT}/data/restaurant_database.json"
export DB_INDEX_FILE="${PROJECT_ROOT}/data/restaurant_database_index.json"
export CORRECTIONS_FILE="${PROJECT_ROOT}/data/corrections.json"
export CANDIDATES_DIR="${PROJECT_ROOT}/data/candidates"
export BACKUPS_DIR="${PROJECT_ROOT}/data/backups"
export PIPELINE_STATE_FILE="${PROJECT_ROOT}/data/.pipeline_state.json"
export XHS_MCP_DIR="${HOME}/.agents/skills/xiaohongshu/scripts"

# API Keys — load from .env if not already set
if [ -f "${PROJECT_ROOT}/.env" ]; then
    # shellcheck disable=SC1090
    set -o allexport
    source "${PROJECT_ROOT}/.env"
    set +o allexport
fi
