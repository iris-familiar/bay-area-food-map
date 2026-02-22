#!/bin/bash
# Bay Area Food Map — Daily Pipeline
#
# Usage:
#   bash pipeline/run.sh              # Full run
#   bash pipeline/run.sh --dry-run    # Skip scraping (verify + corrections only)
#
# Cron: 0 11 * * * cd /path/to/project && bash pipeline/run.sh >> logs/cron.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DRY_RUN="${1:-}"

# Load config (paths, API keys)
source "${PROJECT_DIR}/config.sh"

# ─── Read previous state to carry forward last_scrape_at ──────────────────────
PREV_LAST_SCRAPE_AT=""
if [ -f "${PIPELINE_STATE_FILE}" ]; then
    PREV_LAST_SCRAPE_AT=$(node -e "
        try {
            const s = require('${PIPELINE_STATE_FILE}');
            console.log(s.last_scrape_at || '');
        } catch(e) { console.log(''); }
    " 2>/dev/null || echo "")
fi

# ─── Derived paths ────────────────────────────────────────────────────────────
RUN_DATE=$(date +%Y-%m-%d)
RAW_DIR="${PROJECT_DIR}/data/raw/${RUN_DATE}"
CANDIDATES_FILE="${CANDIDATES_DIR}/${RUN_DATE}.json"
LOG_DIR="${PROJECT_DIR}/logs"

mkdir -p "$LOG_DIR" "$BACKUPS_DIR" "$RAW_DIR" "$CANDIDATES_DIR"

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()    { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
error()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" >&2; }
notify() {
    # Best-effort: notify via openclaw system event (non-blocking)
    /opt/homebrew/lib/node_modules/openclaw/bin/openclaw.js system event \
        --text "$1" --mode now 2>/dev/null || true
}

write_state() {
    local status="$1" new_count="${2:-0}" updated="${3:-0}" scraped="${4:-0}" scrape_ok="${5:-true}"
    local after now_iso last_scrape_at
    after=$(node -e "console.log(require('${DB_FILE}').restaurants.length)" 2>/dev/null || echo "?")
    now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # Only update last_scrape_at when scrape succeeded; otherwise preserve previous value
    if [ "${scrape_ok}" = "true" ]; then
        last_scrape_at="${now_iso}"
    else
        last_scrape_at="${PREV_LAST_SCRAPE_AT}"
    fi
    cat > "${PIPELINE_STATE_FILE}" <<EOF
{
  "last_run": "${now_iso}",
  "last_scrape_at": "${last_scrape_at}",
  "status": "${status}",
  "restaurants_total": ${after},
  "restaurants_added": ${new_count},
  "restaurants_metrics_updated": ${updated},
  "posts_scraped": ${scraped},
  "scrape_ok": ${scrape_ok},
  "dry_run": $([ "${DRY_RUN}" = "--dry-run" ] && echo "true" || echo "false")
}
EOF
}

# ─── Start ────────────────────────────────────────────────────────────────────
log "════════════════════════════════════════"
log "Daily Pipeline — ${RUN_DATE}$([ "${DRY_RUN}" = "--dry-run" ] && echo ' [DRY RUN]' || echo '')"
log "════════════════════════════════════════"

# Step 0: Pre-flight
if [ ! -f "$DB_FILE" ]; then
    error "Database not found: $DB_FILE"
    write_state "failed" 0 0 0 false
    notify "🚨 Bay Area Food Map pipeline FAILED: database missing"
    exit 1
fi
BEFORE=$(node -e "console.log(require('${DB_FILE}').restaurants.length)")
log "Starting: ${BEFORE} restaurants"

# Health check: warn if last successful scrape was >3 days ago
if [ -n "${PREV_LAST_SCRAPE_AT}" ]; then
    STALE=$(node -e "
        const last = new Date('${PREV_LAST_SCRAPE_AT}');
        const diffDays = (Date.now() - last.getTime()) / (1000 * 86400);
        console.log(diffDays > 3 ? 'true' : 'false');
    " 2>/dev/null || echo "false")
    if [ "${STALE}" = "true" ]; then
        log "⚠️  XHS auth hasn't succeeded in 3+ days (last: ${PREV_LAST_SCRAPE_AT})"
        notify "⚠️ 湾区美食地图: XHS auth hasn't succeeded in 3+ days — please re-login: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh"
    fi
fi

# Step 1: Backup
BACKUP="${BACKUPS_DIR}/restaurant_database_$(date +%Y%m%d_%H%M%S).json"
cp "$DB_FILE" "$BACKUP"
log "✅ Backup: $BACKUP"

# ─── Scraping & Extraction ────────────────────────────────────────────────────
SCRAPE_OK=true
POSTS_COUNT=0

if [ "$DRY_RUN" = "--dry-run" ]; then
    log "[DRY RUN] Skipping scrape & extraction"
else
    # Step 2: Scrape XHS
    log "Step 2: Scraping XHS..."
    SCRAPE_SENTINEL="${RAW_DIR}/.scrape_complete"

    if bash "${SCRIPT_DIR}/01_scrape.sh" "$RAW_DIR" 2>&1 | while IFS= read -r line; do log "  $line"; done; then
        touch "$SCRAPE_SENTINEL"
        POSTS_COUNT=$(find "$RAW_DIR" -name "post_*.json" | wc -l | tr -d ' ')
        log "✅ Scrape complete: ${POSTS_COUNT} posts in ${RAW_DIR}"
    else
        SCRAPE_OK=false
        log "⚠️  Scrape failed or skipped (XHS may not be logged in)"
        notify "⚠️ 湾区美食地图: XHS scrape skipped — not logged in. Fix: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh"
    fi

    # Step 3: LLM extraction
    if $SCRAPE_OK && [ "${POSTS_COUNT}" -gt 0 ]; then
        log "Step 3: LLM extraction (GLM-5)..."
        if node "${SCRIPT_DIR}/02_extract_llm.js" "$RAW_DIR" "$CANDIDATES_FILE" \
               2>&1 | while IFS= read -r line; do log "  $line"; done; then
            CANDIDATE_COUNT=$(node -e "try{const a=require('${CANDIDATES_FILE}'); console.log(a.length)}catch(e){console.log(0)}")
            log "✅ Extracted ${CANDIDATE_COUNT} candidates → ${CANDIDATES_FILE}"
        else
            log "⚠️  LLM extraction failed, using empty candidates"
            echo "[]" > "$CANDIDATES_FILE"
        fi
    else
        log "Step 3: No new posts, skipping LLM extraction"
        echo "[]" > "$CANDIDATES_FILE"
    fi

    # Step 4: Enrich candidates with Google Places
    if [ -f "$CANDIDATES_FILE" ]; then
        CANDIDATE_COUNT=$(node -e "try{const a=require('${CANDIDATES_FILE}'); console.log(a.length)}catch(e){console.log(0)}")
        if [ "${CANDIDATE_COUNT}" -gt 0 ]; then
            log "Step 4: Enriching candidates with Google Places..."
            node "${SCRIPT_DIR}/03_enrich_candidates.js" "$CANDIDATES_FILE" \
                2>&1 | while IFS= read -r line; do log "  $line"; done || true
        else
            log "Step 4: No candidates to enrich"
        fi
    fi

    # Step 5: Merge candidates by Google Place ID
    log "Step 5: Merging candidates by Google Place ID..."
    node "${SCRIPT_DIR}/04_merge.js" "$DB_FILE" "$CANDIDATES_FILE" "$DB_FILE" \
        2>&1 | while IFS= read -r line; do log "  $line"; done

    # Count updated restaurants (those with today's timeseries entry)
    METRICS_UPDATED=$(node -e "
        try {
            const state = require('${DB_FILE}');
            const today = '$(date +%Y-%m-%d)';
            const thisMonth = today.slice(0, 7);
            const n = state.restaurants.filter(r =>
                r.updated_at && r.updated_at.startsWith(today) &&
                Array.isArray(r.timeseries) && r.timeseries.some(t => t.month === thisMonth)
            ).length;
            console.log(n);
        } catch(e) { console.log(0); }
    " 2>/dev/null || echo 0)
fi

# Step 6: Verify integrity (auto-restore on failure)
log "Step 6: Verifying integrity..."
if node "${SCRIPT_DIR}/05_verify.js" "$DB_FILE" "$BEFORE" "$BACKUP" \
       2>&1 | while IFS= read -r line; do log "  $line"; done; then
    log "✅ Verification passed"
else
    error "Verification FAILED — restoring backup"
    cp "$BACKUP" "$DB_FILE"
    RESTORED=$(node -e "console.log(require('${DB_FILE}').restaurants.length)")
    log "Restored: ${RESTORED} restaurants"
    write_state "failed" 0 0 "$POSTS_COUNT" "$SCRAPE_OK"
    notify "🚨 湾区美食地图 pipeline FAILED: data integrity error, restored from backup"
    exit 1
fi

# Step 7: Generate slim frontend index
log "Step 7: Generating frontend index..."
node "${SCRIPT_DIR}/06_generate_index.js" "$DB_FILE" "$DB_INDEX_FILE" \
    2>&1 | while IFS= read -r line; do log "  $line"; done

# Step 8: Cleanup old backups (keep 7 days)
find "$BACKUPS_DIR" -name "restaurant_database_*.json" -mtime +7 -delete 2>/dev/null || true

# ─── Summary ──────────────────────────────────────────────────────────────────
AFTER=$(node -e "console.log(require('${DB_FILE}').restaurants.length)")
ADDED=$((AFTER - BEFORE))

write_state "success" "$ADDED" "${METRICS_UPDATED:-0}" "${POSTS_COUNT:-0}" "$SCRAPE_OK"

# Step 9: Auto git commit data changes
log "Step 9: Committing data changes..."
bash "${SCRIPT_DIR}/07_commit.sh" "$BEFORE" "$AFTER" 2>&1 

log "════════════════════════════════════════"
log "✅ Pipeline complete!"
log "   Restaurants: ${BEFORE} → ${AFTER} (+${ADDED})"
log "   Posts scraped: ${POSTS_COUNT:-0}"
log "   Backup: ${BACKUP}"
log "════════════════════════════════════════"

# Notify on meaningful changes
if [ "${ADDED}" -gt 0 ]; then
    notify "✅ 湾区美食地图 pipeline: +${ADDED} new restaurants (total: ${AFTER})"
fi
