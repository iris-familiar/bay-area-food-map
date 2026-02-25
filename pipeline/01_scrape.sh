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
# Response is JSON-RPC: { "result": { "content": [{ "text": "✅ 已登录..." }] } }
LOGIN_STATUS=$(cd "${MCP_DIR}" && ./mcp-call.sh check_login_status '{}' 2>/dev/null \
    | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    text = d.get('result', {}).get('content', [{}])[0].get('text', '')
    print('logged_in' if '已登录' in text else 'not_logged_in')
except Exception:
    print('unknown')
" 2>/dev/null \
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
    # Geographic expansion
    "旧金山美食"
    "旧金山中餐"
    "东湾美食"
    "Oakland美食"
    "Berkeley美食"
    "Daly City美食"
    "San Jose美食"
    "San Mateo美食"
    "半岛美食"
    # Cuisine diversification
    "湾区粤菜"
    "湾区日料推荐"
    "湾区韩餐推荐"
    "湾区越南菜"
    "湾区港式茶餐厅"
    "湾区早茶"
    "南湾日料"
    # Discovery angles
    "湾区新开餐厅"
    "湾区网红餐厅"
    "硅谷美食探店"
    "南湾必吃"
)

NEW_COUNT=0
SKIP_COUNT=0
REFRESH_COUNT=0
TOTAL_FOUND=0
FILTERED_OUT=0

# Re-scrape posts older than this many days to update engagement data
REFRESH_AGE_DAYS="${REFRESH_AGE_DAYS:-7}"

# Build a map of existing posts with their file paths and modification times
# Format: post_id\tfile_path\tdays_old
ALL_RAW_DIR="$(dirname "$OUTPUT_DIR")"
EXISTING_POSTS_MAP=$(find "$ALL_RAW_DIR" -name "post_*.json" -type f 2>/dev/null | while read -r f; do
    basename "$f" .json | sed 's/^post_//'
    echo -ne "\t$f\t"
    # Calculate days since file was modified
    perl -e 'use int((time - (stat($ARGV[0]))[9]) / 86400)' "$f" 2>/dev/null || echo "0"
done)

for term in "${SEARCH_TERMS[@]}"; do
    log "Searching: $term"

    RESULT=$(cd "${MCP_DIR}" && ./mcp-call.sh search_feeds "{\"keyword\": \"${term}\"}" 2>/dev/null || echo '{}')

    # Count total posts found before filtering
    TERM_TOTAL=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    outer = json.load(sys.stdin)
    text = outer.get('result', {}).get('content', [{}])[0].get('text', '')
    try:
        data = json.loads(text)
    except (ValueError, KeyError):
        data = outer
    feeds = data.get('feeds', data.get('items', []))
    print(len(feeds))
except Exception:
    print(0)
" 2>/dev/null || echo "0")
    TOTAL_FOUND=$((TOTAL_FOUND + TERM_TOTAL))

    # Extract post IDs with decent engagement
    # Response is JSON-RPC: unwrap result.content[0].text to get actual feeds JSON.
    # interactInfo is nested inside noteCard; counts arrive as strings.
    POSTS=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    outer = json.load(sys.stdin)
    text = outer.get('result', {}).get('content', [{}])[0].get('text', '')
    try:
        data = json.loads(text)
    except (ValueError, KeyError):
        data = outer  # fallback if already unwrapped
    feeds = data.get('feeds', data.get('items', []))
    for f in feeds:
        card = f.get('noteCard', f)
        interact = card.get('interactInfo', f.get('interactInfo', {}))
        comments = int(interact.get('commentCount', 0) or 0)
        likes = int(interact.get('likedCount', 0) or 0)
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

        POST_FILE="post_${note_id}.json"
        OUT_FILE="${OUTPUT_DIR}/${POST_FILE}"

        # Check if post already exists and when it was last scraped
        EXISTING_LINE=$(echo "$EXISTING_POSTS_MAP" | grep "^${note_id}" | head -1)
        if [ -n "$EXISTING_LINE" ]; then
            EXISTING_PATH=$(echo "$EXISTING_LINE" | cut -f2)
            DAYS_OLD=$(echo "$EXISTING_LINE" | cut -f3)

            # Skip if scraped recently (within REFRESH_AGE_DAYS)
            if [ "$DAYS_OLD" -lt "$REFRESH_AGE_DAYS" ] 2>/dev/null; then
                ((SKIP_COUNT++))
                continue
            fi

            # Re-scrape old posts to update engagement data
            # We'll update the existing file in place
            OUT_FILE="$EXISTING_PATH"
            log "  🔄 Refreshing (${DAYS_OLD}d old): $note_id"
        fi

        # Unwrap JSON-RPC envelope; normalize data.note to flat structure
        # that 02_extract_llm.js expects (title/desc/id/interactInfo at top level).
        # MCP server uses "feed_id", not "note_id".
        DETAIL=$(cd "${MCP_DIR}" && ./mcp-call.sh get_feed_detail \
            "{\"feed_id\": \"${note_id}\", \"xsec_token\": \"${xsec_token}\"}" \
            2>/dev/null \
            | python3 -c "
import sys, json
try:
    outer = json.load(sys.stdin)
    text = outer.get('result', {}).get('content', [{}])[0].get('text', '')
    inner = json.loads(text) if text else outer
    note = inner.get('data', {}).get('note', {})
    if note:
        normalized = {
            'id': note.get('noteId', inner.get('feed_id', '')),
            'noteId': note.get('noteId', ''),
            'title': note.get('title', ''),
            'desc': note.get('desc', ''),
            'interactInfo': note.get('interactInfo', {}),
            'comments': note.get('comments', note.get('commentList', [])),
            'user': note.get('user', {}),
            'time': note.get('time', ''),
        }
        print(json.dumps(normalized))
    else:
        print('{}')
except Exception:
    print('{}')
" 2>/dev/null || echo '{}')

        # Only save if valid JSON with content
        if echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('title') or d.get('desc')" 2>/dev/null; then
            # Determine if this is a refresh or new post
            if [ -n "$EXISTING_LINE" ]; then
                ((REFRESH_COUNT++))
            else
                ((NEW_COUNT++))
                log "  ✅ Saved: $note_id"
            fi
            echo "$DETAIL" > "$OUT_FILE"
        fi

        # Anti-rate-limit delay: 2-4 seconds between posts
        sleep $((RANDOM % 3 + 2))
    done <<< "$POSTS"

    # 3-6 second delay between search terms
    sleep $((RANDOM % 4 + 3))
done

# Calculate filtered out count
PASSED_FILTER=$((NEW_COUNT + SKIP_COUNT + REFRESH_COUNT))
FILTERED_OUT=$((TOTAL_FOUND - PASSED_FILTER))

log "Done. Total found: ${TOTAL_FOUND}, Passed filter: ${PASSED_FILTER} (New: ${NEW_COUNT}, Refreshed: ${REFRESH_COUNT}, Skipped: ${SKIP_COUNT}), Filtered out: ${FILTERED_OUT}"
