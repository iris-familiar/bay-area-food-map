#!/bin/bash
# 07_commit.sh — Auto-commit pipeline data changes to git
# Called by run.sh at the end of a successful pipeline run.
#
# Only commits if data files actually changed (idempotent).
# Usage: bash pipeline/07_commit.sh <before_count> <after_count>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${PROJECT_DIR}/config.sh"

BEFORE="${1:-?}"
AFTER="${2:-?}"
DATE=$(date +%Y-%m-%d)

cd "$PROJECT_DIR"

# Check if tracked data files changed
if git diff --quiet HEAD -- data/restaurant_database.json data/restaurant_database_index.json data/.pipeline_state.json 2>/dev/null; then
    echo "No data changes to commit"
    exit 0
fi

ADDED=$((AFTER - BEFORE))
SIGN=$([ "$ADDED" -ge 0 ] && echo "+" || echo "")

git add \
    data/restaurant_database.json \
    data/restaurant_database_index.json \
    data/.pipeline_state.json

git commit -m "data: ${DATE} pipeline ${SIGN}${ADDED} restaurants (total: ${AFTER})"

echo "✅ Committed: ${DATE} +${ADDED} restaurants"
