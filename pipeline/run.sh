#!/bin/bash
# Bay Area Food Map — Daily Pipeline
# Usage: bash pipeline/run.sh [--dry-run]
# Cron: 0 11 * * * cd /path/to/project && bash pipeline/run.sh >> logs/cron.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_FILE="${PROJECT_DIR}/data/restaurant_database.json"
RAW_DIR="${PROJECT_DIR}/data/raw/$(date +%Y-%m-%d)"
LOG_DIR="${PROJECT_DIR}/logs"
BACKUP_DIR="${PROJECT_DIR}/data/backups"
DRY_RUN="${1:-}"

mkdir -p "$LOG_DIR" "$BACKUP_DIR" "$RAW_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: $1" >&2; }

log "========================================"
log "Daily Pipeline — $(date '+%Y-%m-%d')"
log "========================================"

# Step 0: Verify database exists and is healthy
if [ ! -f "$DB_FILE" ]; then
    error "Database not found: $DB_FILE"
    exit 1
fi
BEFORE=$(node -e "console.log(require('$DB_FILE').restaurants.length)")
log "Starting with ${BEFORE} restaurants"

# Step 1: Backup current database
BACKUP="${BACKUP_DIR}/restaurant_database_$(date +%Y%m%d_%H%M%S).json"
cp "$DB_FILE" "$BACKUP"
log "✅ Backup created: $BACKUP"

# Step 2: Scrape new XHS data
if [ "$DRY_RUN" = "--dry-run" ]; then
    log "[DRY RUN] Skipping scrape step"
else
    log "Step 2: Scraping XHS data..."
    if bash "${SCRIPT_DIR}/01_scrape.sh" "$RAW_DIR" 2>&1 | while IFS= read -r line; do log "  $line"; done; then
        log "✅ Scrape complete"
    else
        log "⚠️  Scrape failed or skipped (continuing pipeline)"
    fi
fi

# Step 3: Extract restaurants from raw data
if ls "$RAW_DIR"/*.json 2>/dev/null | head -1 | grep -q .; then
    log "Step 3: Extracting restaurants from scraped data..."
    CANDIDATES_FILE="/tmp/candidates_$(date +%Y%m%d).json"
    node "${SCRIPT_DIR}/02_extract.js" "$RAW_DIR" "$CANDIDATES_FILE" 2>&1 | while IFS= read -r line; do log "  $line"; done

    # Step 4: Merge new restaurants into database
    log "Step 4: Merging new data..."
    node "${SCRIPT_DIR}/03_merge.js" "$DB_FILE" "$CANDIDATES_FILE" "$DB_FILE" 2>&1 | while IFS= read -r line; do log "  $line"; done
else
    log "Step 3/4: No new raw data, skipping extraction and merge"
fi

# Step 5: Apply manual corrections (always runs)
log "Step 5: Applying manual corrections..."
CORRECTIONS="${PROJECT_DIR}/data/corrections.json"
if [ -f "$CORRECTIONS" ]; then
    node "${PROJECT_DIR}/scripts/apply_corrections.js" 2>&1 | while IFS= read -r line; do log "  $line"; done || true
else
    log "  No corrections.json found, skipping"
fi

# Step 6: Verify data integrity (CRITICAL — auto-restores on failure)
log "Step 6: Verifying data integrity..."
if node "${SCRIPT_DIR}/04_verify.js" "$DB_FILE" "$BEFORE" "$BACKUP" 2>&1 | while IFS= read -r line; do log "  $line"; done; then
    log "✅ Verification passed"
else
    error "Verification FAILED! Restoring from backup..."
    cp "$BACKUP" "$DB_FILE"
    RESTORED=$(node -e "console.log(require('$DB_FILE').restaurants.length)")
    log "Restored: ${RESTORED} restaurants from backup"
    exit 1
fi

# Step 7: Cleanup old backups (keep 7 days)
find "$BACKUP_DIR" -name "restaurant_database_*.json" -mtime +7 -delete 2>/dev/null || true

AFTER=$(node -e "console.log(require('$DB_FILE').restaurants.length)")
log "========================================"
log "✅ Pipeline complete! ${BEFORE} → ${AFTER} restaurants"
log "Backup: $BACKUP"
log "========================================"
