#!/bin/bash
# Bay Area Food Map — Name-Based Enrichment Pipeline
#
# Usage:
#   bash pipeline/run_by_name.sh              # Process next 50 restaurants
#   LIMIT=20 bash pipeline/run_by_name.sh     # Process next 20 restaurants
#
# On-demand enrichment: search XHS by restaurant name, then run full downstream pipeline.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load config (paths, API keys)
source "${PROJECT_DIR}/config.sh"

LIMIT="${LIMIT:-50}"
RUN_DATE=$(date +%Y-%m-%d)
RAW_DIR="${PROJECT_DIR}/data/raw/${RUN_DATE}"
CANDIDATES_FILE="${CANDIDATES_DIR}/${RUN_DATE}.json"

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" >&2; }

mkdir -p "$RAW_DIR" "$CANDIDATES_DIR" "$BACKUPS_DIR"

# ─── Start ────────────────────────────────────────────────────────────────────
log "════════════════════════════════════════"
log "Name Enrichment Pipeline — ${RUN_DATE} (limit: ${LIMIT})"
log "════════════════════════════════════════"

if [ ! -f "$DB_FILE" ]; then
    error "Database not found: $DB_FILE"
    exit 1
fi

BEFORE=$(node -e "console.log(require('${DB_FILE}').restaurants.length)")
log "Starting: ${BEFORE} restaurants"

# Backup
BACKUP="${BACKUPS_DIR}/restaurant_database_$(date +%Y%m%d_%H%M%S).json"
cp "$DB_FILE" "$BACKUP"
log "✅ Backup: $BACKUP"

# Step 1: Scrape by restaurant name
log "Step 1: Searching XHS by restaurant name (limit: ${LIMIT})..."
if node "${SCRIPT_DIR}/01_scrape_by_name.js" --limit "${LIMIT}" \
       2>&1 | while IFS= read -r line; do log "  $line"; done; then
    POSTS_COUNT=$(find "$RAW_DIR" -name "post_*.json" 2>/dev/null | wc -l | tr -d ' ')
    log "✅ Scrape complete: ${POSTS_COUNT} posts in ${RAW_DIR}"
else
    SCRAPE_EXIT=$?
    if [ "${SCRAPE_EXIT}" = "2" ]; then
        log "⚠️  XHS not logged in — run: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh"
    else
        log "⚠️  Scrape step failed (exit ${SCRAPE_EXIT})"
    fi
    exit "${SCRAPE_EXIT}"
fi

POSTS_COUNT=$(find "$RAW_DIR" -name "post_*.json" 2>/dev/null | wc -l | tr -d ' ')

# Step 2: LLM extraction
if [ "${POSTS_COUNT}" -gt 0 ]; then
    log "Step 2: LLM extraction (GLM-5)..."
    if node "${SCRIPT_DIR}/02_extract_llm.js" "$RAW_DIR" "$CANDIDATES_FILE" \
           2>&1 | while IFS= read -r line; do log "  $line"; done; then
        CANDIDATE_COUNT=$(node -e "try{const a=require('${CANDIDATES_FILE}');console.log(a.length)}catch(e){console.log(0)}")
        log "✅ Extracted ${CANDIDATE_COUNT} candidates → ${CANDIDATES_FILE}"
    else
        log "⚠️  LLM extraction failed, using empty candidates"
        echo "[]" > "$CANDIDATES_FILE"
    fi
else
    log "Step 2: No new posts, skipping LLM extraction"
    echo "[]" > "$CANDIDATES_FILE"
fi

# Step 3: Enrich candidates with Google Places
CANDIDATE_COUNT=$(node -e "try{const a=require('${CANDIDATES_FILE}');console.log(a.length)}catch(e){console.log(0)}")
if [ "${CANDIDATE_COUNT}" -gt 0 ]; then
    log "Step 3: Enriching candidates with Google Places..."
    node "${SCRIPT_DIR}/03_enrich_candidates.js" "$CANDIDATES_FILE" \
        2>&1 | while IFS= read -r line; do log "  $line"; done || true
else
    log "Step 3: No candidates to enrich"
fi

# Step 4: Merge candidates
log "Step 4: Merging candidates by Google Place ID..."
node "${SCRIPT_DIR}/04_merge.js" "$DB_FILE" "$CANDIDATES_FILE" "$DB_FILE" \
    2>&1 | while IFS= read -r line; do log "  $line"; done

# Step 5: Verify integrity (auto-restore on failure)
log "Step 5: Verifying integrity..."
if node "${SCRIPT_DIR}/05_verify.js" "$DB_FILE" "$BEFORE" "$BACKUP" \
       2>&1 | while IFS= read -r line; do log "  $line"; done; then
    log "✅ Verification passed"
else
    error "Verification FAILED — restoring backup"
    cp "$BACKUP" "$DB_FILE"
    exit 1
fi

# Step 6: Generate slim frontend index
log "Step 6: Generating frontend index..."
node "${SCRIPT_DIR}/06_generate_index.js" "$DB_FILE" "$DB_INDEX_FILE" \
    2>&1 | while IFS= read -r line; do log "  $line"; done

# Step 7: Auto git commit data changes
AFTER=$(node -e "console.log(require('${DB_FILE}').restaurants.length)")
ADDED=$((AFTER - BEFORE))
log "Step 7: Committing data changes..."
bash "${SCRIPT_DIR}/07_commit.sh" "$BEFORE" "$AFTER" 2>&1

log "════════════════════════════════════════"
log "✅ Name enrichment complete!"
log "   Restaurants: ${BEFORE} → ${AFTER} (+${ADDED})"
log "   Posts scraped: ${POSTS_COUNT}"
log "   Backup: ${BACKUP}"
log "════════════════════════════════════════"
