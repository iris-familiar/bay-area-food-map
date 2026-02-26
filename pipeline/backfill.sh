#!/bin/bash
# pipeline/backfill.sh — One-time re-extraction + merge for all historical raw posts
#
# Usage:
#   bash pipeline/backfill.sh              # Full backfill (uses GLM + Google APIs)
#   bash pipeline/backfill.sh --dry-run    # List what would run; no API calls, no changes
#
# Idempotent: dates with an existing non-empty _backfill.json are skipped automatically.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DRY_RUN="${1:-}"

source "${PROJECT_DIR}/config.sh"

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" >&2; }

# ── Validate API keys (skip in dry-run) ─────────────────────────────────────
if [ "${DRY_RUN}" != "--dry-run" ]; then
    if [ -z "${GLM_API_KEY:-}" ]; then
        error "GLM_API_KEY not set. Check .env file."
        exit 1
    fi
    if [ -z "${GOOGLE_PLACES_API_KEY:-}" ]; then
        error "GOOGLE_PLACES_API_KEY not set. Check .env file."
        exit 1
    fi
fi

# ── Record before-state ──────────────────────────────────────────────────────
BEFORE_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DB_FILE}')).restaurants.length)" 2>/dev/null || echo "0")
log "Starting backfill. Current DB: ${BEFORE_COUNT} restaurants."

# ── Backup ───────────────────────────────────────────────────────────────────
BACKUP=""
if [ "${DRY_RUN}" != "--dry-run" ]; then
    mkdir -p "${BACKUPS_DIR}"
    BACKUP="${BACKUPS_DIR}/restaurant_database.backfill-$(date +%Y%m%d-%H%M%S).json"
    cp "${DB_FILE}" "${BACKUP}"
    log "Backup saved: ${BACKUP}"
fi

# ── Process each raw date directory ─────────────────────────────────────────
PROCESSED=0
SKIPPED=0

for RAW_DIR in $(ls -d "${PROJECT_DIR}/data/raw"/????-??-??/ 2>/dev/null | sort); do
    DATE=$(basename "${RAW_DIR}")
    POST_COUNT=$(find "${RAW_DIR}" -name "post_*.json" 2>/dev/null | wc -l | tr -d ' ')

    if [ "${POST_COUNT}" -eq 0 ]; then
        continue
    fi

    BACKFILL_FILE="${CANDIDATES_DIR}/${DATE}_backfill.json"

    # Idempotency: skip if already backfilled (non-empty file means extraction ran)
    if [ -f "${BACKFILL_FILE}" ] && [ "$(wc -c < "${BACKFILL_FILE}")" -gt 10 ]; then
        log "  ${DATE}: already backfilled — skipping (delete ${DATE}_backfill.json to re-run)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    log "  ${DATE}: ${POST_COUNT} posts"

    if [ "${DRY_RUN}" = "--dry-run" ]; then
        log "  [dry-run] would extract → enrich → merge for ${DATE}"
        continue
    fi

    # Step A: LLM Extraction
    # MAX_POSTS=9999: process all posts (bypass the 100-post daily cap)
    # GLM_TIMEOUT_MS=90000: 90s timeout (GLM can be slow under load)
    # DELAY_MS=500: gentler pacing to reduce rate limit hits
    log "    [1/3] Extracting with GLM..."
    MAX_POSTS=9999 GLM_TIMEOUT_MS=90000 DELAY_MS=500 \
        node "${SCRIPT_DIR}/02_extract_llm.js" "${RAW_DIR}" "${BACKFILL_FILE}"

    CANDIDATE_COUNT=$(node -e "try { console.log(JSON.parse(require('fs').readFileSync('${BACKFILL_FILE}')).length) } catch(e) { console.log(0) }")
    log "    → ${CANDIDATE_COUNT} candidates extracted"

    if [ "${CANDIDATE_COUNT}" -eq 0 ]; then
        log "    No candidates — skipping enrich + merge for ${DATE}"
        PROCESSED=$((PROCESSED + 1))
        continue
    fi

    # Step B: Google Places Enrichment
    log "    [2/3] Enriching with Google Places..."
    node "${SCRIPT_DIR}/03_enrich_candidates.js" "${BACKFILL_FILE}"

    # Step C: Merge into database
    log "    [3/3] Merging into database..."
    node "${SCRIPT_DIR}/04_merge.js" "${DB_FILE}" "${BACKFILL_FILE}" "${DB_FILE}"

    PROCESSED=$((PROCESSED + 1))
    log "    ✅ ${DATE} done"
done

if [ "${DRY_RUN}" = "--dry-run" ]; then
    log "Dry-run complete. No changes made."
    exit 0
fi

# ── Verify integrity ─────────────────────────────────────────────────────────
log "Running integrity check..."
if ! node "${SCRIPT_DIR}/05_verify.js" "${DB_FILE}" "${BEFORE_COUNT}" "${BACKUP}"; then
    error "Integrity check failed. Restoring backup..."
    cp "${BACKUP}" "${DB_FILE}"
    error "Restored from ${BACKUP}. Backfill aborted."
    exit 1
fi

# ── Regenerate index ─────────────────────────────────────────────────────────
log "Regenerating frontend index..."
node "${SCRIPT_DIR}/06_generate_index.js" "${DB_FILE}" "${DB_INDEX_FILE}"

# ── Re-apply manual corrections ──────────────────────────────────────────────
log "Re-applying manual corrections..."
node "${PROJECT_DIR}/scripts/apply_corrections.js"

# ── Summary ──────────────────────────────────────────────────────────────────
AFTER_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DB_FILE}')).restaurants.length)" 2>/dev/null || echo "?")
ADDED=$((AFTER_COUNT - BEFORE_COUNT))

log "────────────────────────────────────────────────"
log "Backfill complete."
log "  Dates processed : ${PROCESSED} | Already done: ${SKIPPED}"
log "  Restaurants     : ${BEFORE_COUNT} → ${AFTER_COUNT} (net +${ADDED} new)"
log "  Backup          : ${BACKUP}"
