#!/bin/bash
# Fetch remaining posts from Xiaohongshu

SKILL_DIR="/Users/joeli/.agents/skills/xiaohongshu"
DATA_DIR="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data"

# Read remaining posts and fetch each one
cd "$SKILL_DIR"

while IFS='|' read -r note_id xsec_token; do
    echo "Fetching post: $note_id"
    
    # Fetch post detail using feed_id instead of note_id
    ./scripts/mcp-call.sh get_feed_detail "{\"feed_id\": \"$note_id\", \"xsec_token\": \"$xsec_token\", \"load_all_comments\": true}" > "$DATA_DIR/posts/2026-02-16/${note_id}.json" 2>&1
    
    echo "  ✓ Saved post for $note_id"
    sleep 0.5
done < /tmp/remaining_posts_simple.txt

echo "All posts fetched!"
