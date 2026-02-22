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

for term in "${SEARCH_TERMS[@]}"; do
    log "Searching: $term"

    RESULT=$(cd "${MCP_DIR}" && ./mcp-call.sh search_feeds "{\"keyword\": \"${term}\"}" 2>/dev/null || echo '{}')

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

        OUT_FILE="${OUTPUT_DIR}/post_${note_id}.json"
        if [ -f "$OUT_FILE" ]; then
            ((SKIP_COUNT++))
            continue  # Already fetched
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
            echo "$DETAIL" > "$OUT_FILE"
            ((NEW_COUNT++))
            log "  ✅ Saved: $note_id"
        fi

        # Anti-rate-limit delay: 2-4 seconds between posts
        sleep $((RANDOM % 3 + 2))
    done <<< "$POSTS"

    # 3-6 second delay between search terms
    sleep $((RANDOM % 4 + 3))
done

log "Done. New: ${NEW_COUNT} posts, Skipped (already had): ${SKIP_COUNT}"
