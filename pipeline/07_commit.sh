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
if git diff --quiet HEAD -- site/data/restaurant_database.json site/data/restaurant_database_index.json site/data/.pipeline_state.json 2>/dev/null; then
    echo "No data changes to commit"
    exit 0
fi

# Check if the only changes are timestamps (verified_at, last_run) - skip commit if so
# This prevents empty commits when 05_verify.js just updates verified_at
NON_TIMESTAMP_CHANGES=$(git diff HEAD -- site/data/restaurant_database.json site/data/.pipeline_state.json 2>/dev/null | \
    grep -E '^[+-]' | \
    grep -v '^[+-]{3}' | \
    grep -vE '^[+-]\s*"(verified_at|last_run)"' | \
    grep -vE '^[+-]\s*"verified_at"' | \
    grep -vE '^[+-]\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}T' | \
    wc -l | tr -d ' ')

if [ "$NON_TIMESTAMP_CHANGES" -eq 0 ]; then
    echo "Only timestamp changes detected, skipping commit"
    git checkout -- site/data/restaurant_database.json site/data/.pipeline_state.json 2>/dev/null || true
    exit 0
fi

ADDED=$((AFTER - BEFORE))
SIGN=$([ "$ADDED" -ge 0 ] && echo "+" || echo "")

git add \
    site/data/restaurant_database.json \
    site/data/restaurant_database_index.json \
    site/data/.pipeline_state.json

git commit -m "data: ${DATE} pipeline ${SIGN}${ADDED} restaurants (total: ${AFTER})"

echo "✅ Committed: ${DATE} +${ADDED} restaurants"
