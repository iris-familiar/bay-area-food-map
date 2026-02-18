#!/bin/bash
# Fetch remaining posts from Xiaohongshu

SKILL_DIR="/Users/joeli/.agents/skills/xiaohongshu"
DATA_DIR="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data"

# Read remaining posts and fetch each one
cd "$SKILL_DIR"

while IFS='|' read -r note_id xsec_token; do
    echo "Fetching post: $note_id"
    
    # Fetch post detail using the correct script path
    ./scripts/post-detail.sh "$note_id" > "$DATA_DIR/posts/2026-02-16/${note_id}.json" 2>&1
    
    # Fetch comments using the correct script path
    ./scripts/comment.sh "$note_id" > "$DATA_DIR/comments/2026-02-16/${note_id}.json" 2>&1
    
    echo "  ✓ Saved post and comments for $note_id"
    sleep 0.5
done < /tmp/remaining_posts_simple.txt

echo "All posts fetched!"
