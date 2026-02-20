#!/bin/bash
# Scrape new XHS posts about Bay Area restaurants
# Usage: bash pipeline/01_scrape.sh <output_dir>
# Output: JSON files in <output_dir>/post_<id>.json

set -euo pipefail

OUTPUT_DIR="${1:-/tmp/xhs_raw}"
MCP_DIR="${HOME}/.agents/skills/xiaohongshu/scripts"
mkdir -p "$OUTPUT_DIR"

log() { echo "[scrape] $1"; }

# Check MCP is available
if [ ! -f "${MCP_DIR}/mcp-call.sh" ]; then
    log "WARNING: XHS MCP not found at ${MCP_DIR}. Skipping."
    exit 0
fi

# Check MCP is running and logged in
LOGIN_STATUS=$(cd "${MCP_DIR}" && ./mcp-call.sh check_login_status '{}' 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null \
    || echo "unknown")

if [ "$LOGIN_STATUS" != "logged_in" ]; then
    log "WARNING: XHS MCP not logged in (status: ${LOGIN_STATUS}). Skipping."
    log "To fix: use the xiaohongshu skill to log in via QR code"
    exit 2
fi

log "XHS MCP online. Starting search..."

SEARCH_TERMS=(
    "湾区餐厅推荐"
    "湾区美食探店"
    "Cupertino中餐"
    "Milpitas美食"
    "Fremont餐厅"
    "Mountain View餐厅"
    "Sunnyvale美食"
    "南湾川菜"
    "南湾湘菜"
    "湾区火锅推荐"
    "湾区宝藏餐厅"
    "南湾探店"
)

NEW_COUNT=0
SKIP_COUNT=0

for term in "${SEARCH_TERMS[@]}"; do
    log "Searching: $term"

    RESULT=$(cd "${MCP_DIR}" && ./mcp-call.sh search_feeds "{\"keyword\": \"${term}\"}" 2>/dev/null || echo '{"feeds":[]}')

    # Extract post IDs with decent engagement
    POSTS=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    feeds = data.get('feeds', data.get('items', []))
    for f in feeds:
        interact = f.get('interactInfo', {})
        comments = interact.get('commentCount', 0)
        likes = interact.get('likedCount', 0)
        if comments >= 3 or likes >= 20:
            note_id = f.get('id', f.get('noteId', ''))
            xsec = f.get('xsecToken', '')
            if note_id:
                print(note_id + '\t' + xsec)
except Exception:
    pass
" 2>/dev/null || echo "")

    while IFS=$'\t' read -r note_id xsec_token; do
        [ -z "$note_id" ] && continue

        OUT_FILE="${OUTPUT_DIR}/post_${note_id}.json"
        if [ -f "$OUT_FILE" ]; then
            ((SKIP_COUNT++))
            continue  # Already fetched
        fi

        DETAIL=$(cd "${MCP_DIR}" && ./mcp-call.sh get_feed_detail \
            "{\"note_id\": \"${note_id}\", \"xsec_token\": \"${xsec_token}\"}" \
            2>/dev/null || echo '{}')

        # Only save if valid JSON with content
        if echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('title') or d.get('desc')" 2>/dev/null; then
            echo "$DETAIL" > "$OUT_FILE"
            ((NEW_COUNT++))
            log "  ✅ Saved: $note_id"
        fi

        # Anti-rate-limit delay: 3-7 seconds between posts
        sleep $((RANDOM % 5 + 3))
    done <<< "$POSTS"

    # 5-10 second delay between search terms
    sleep $((RANDOM % 6 + 5))
done

log "Done. New: ${NEW_COUNT} posts, Skipped (already had): ${SKIP_COUNT}"
