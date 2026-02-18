#!/bin/bash
#
# 小红书餐厅数据日常维护 - Enhanced v5
# 包含帖子正文和评论深度采集
#

set -e

WORKSPACE="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map"
DATA_DIR="$WORKSPACE/data"
RAW_DIR="$DATA_DIR/raw"
SKILL_DIR="/Users/joeli/.agents/skills/xiaohongshu/scripts"
LOG_FILE="$DATA_DIR/daily/cron-$(date +%Y-%m-%d).log"

# Create daily directory
mkdir -p "$DATA_DIR/daily/$(date +%Y-%m-%d)"
mkdir -p "$DATA_DIR/posts/$(date +%Y-%m-%d)"
mkdir -p "$DATA_DIR/comments/$(date +%Y-%m-%d)"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$WORKSPACE"

log "=== 小红书餐厅数据日常维护 v5 ==="
log "日期: $(date)"

# =============================================================================
# STEP 1: 搜索新帖子（获取标题+正文）
# =============================================================================
log "Step 1: 搜索新帖子..."

SEARCH_TERMS=(
    "Cupertino美食"
    "Milpitas美食"
    "Fremont美食"
    "Mountain View美食"
    "Sunnyvale美食"
    "湾区美食"
    "湾区探店"
)

NEW_POSTS_FILE="$DATA_DIR/daily/$(date +%Y-%m-%d)/new_posts_search.json"
echo "[]" > "$NEW_POSTS_FILE"

for term in "${SEARCH_TERMS[@]}"; do
    log "  搜索: $term"
    # Use xiaohongshu skill to search
    if [ -f "$SKILL_DIR/search.sh" ]; then
        RESULT=$("$SKILL_DIR/search.sh" "$term" 2>/dev/null || echo "[]")
        echo "$RESULT" >> "$NEW_POSTS_FILE"
    fi
    sleep 2
done

# =============================================================================
# STEP 2: 获取每条帖子的完整正文和评论
# =============================================================================
log "Step 2: 获取帖子详情（正文+评论）..."

# Parse new posts and fetch details
POSTS_TO_FETCH="$DATA_DIR/daily/$(date +%Y-%m-%d)/posts_to_fetch.json"
FETCHED_POSTS="$DATA_DIR/daily/$(date +%Y-%m-%d)/fetched_posts.json"

# Extract posts that need fetching
node "$WORKSPACE/scripts/extract_posts_to_fetch.js" \
    "$NEW_POSTS_FILE" \
    "$POSTS_TO_FETCH"

# Fetch full content for each post
if [ -f "$POSTS_TO_FETCH" ] && [ -s "$POSTS_TO_FETCH" ]; then
    log "  获取 $(cat $POSTS_TO_FETCH | wc -l) 条帖子详情..."
    
    node "$WORKSPACE/scripts/fetch_posts_batch.js" \
        "$POSTS_TO_FETCH" \
        "$DATA_DIR/posts/$(date +%Y-%m-%d)" \
        "$FETCHED_POSTS"
else
    log "  没有新帖子需要获取"
fi

# =============================================================================
# STEP 3: 从正文和评论中提取餐厅候选
# =============================================================================
log "Step 3: 提取餐厅候选..."

RESTAURANT_CANDIDATES="$DATA_DIR/daily/$(date +%Y-%m-%d)/restaurant_candidates.json"

node "$WORKSPACE/scripts/extract_restaurants_from_posts.js" \
    "$DATA_DIR/posts/$(date +%Y-%m-%d)" \
    "$RESTAURANT_CANDIDATES"

# =============================================================================
# STEP 4: 验证新发现的餐厅
# =============================================================================
log "Step 4: 验证餐厅..."

VERIFIED_RESTAURANTS="$DATA_DIR/daily/$(date +%Y-%m-%d)/verified_restaurants.json"

node "$WORKSPACE/scripts/verify_restaurants.js" \
    "$RESTAURANT_CANDIDATES" \
    "$VERIFIED_RESTAURANTS"

# =============================================================================
# STEP 5: 更新餐厅讨论度和情感分析
# =============================================================================
log "Step 5: 更新餐厅指标..."

node "$WORKSPACE/scripts/update_restaurant_metrics.js" \
    "$DATA_DIR/current/restaurant_database_v5_full_content.json" \
    "$DATA_DIR/posts/$(date +%Y-%m-%d)" \
    "$DATA_DIR/daily/$(date +%Y-%m-%d)/mentions.json"

# =============================================================================
# STEP 7: 应用数据修正 (确保人工修复不被覆盖)
# =============================================================================
log "Step 7: 应用数据修正..."

node "$WORKSPACE/scripts/apply_corrections.js"

# 同步到UI版本
cp "$DATA_DIR/current/restaurant_database_v5_full_content.json" \
   "$DATA_DIR/current/restaurant_database_v5_ui.json"

log "✅ 数据修正已应用"

# =============================================================================
# STEP 8: 归档数据
# =============================================================================
log "Step 8: 归档数据..."

# Create archive of current database
cp "$DATA_DIR/current/restaurant_database_v5_full_content.json" \
   "$DATA_DIR/archive/restaurant_database_$(date +%Y%m%d_%H%M%S).json"

# Save daily summary
SUMMARY="$DATA_DIR/daily/$(date +%Y-%m-%d)/summary.json"
cat > "$SUMMARY" << EOF
{
  "date": "$(date +%Y-%m-%d)",
  "new_posts_searched": $(cat "$NEW_POSTS_FILE" | grep -c '"id"' || echo 0),
  "posts_fetched": $(ls "$DATA_DIR/posts/$(date +%Y-%m-%d)"/*.json 2>/dev/null | wc -l || echo 0),
  "comments_extracted": $(cat "$DATA_DIR/comments/$(date +%Y-%m-%d)"/*_full.json 2>/dev/null | grep -c '"commentId"' || echo 0),
  "restaurant_candidates": $(cat "$RESTAURANT_CANDIDATES" 2>/dev/null | grep -c '"name"' || echo 0),
  "restaurants_verified": $(cat "$VERIFIED_RESTAURANTS" 2>/dev/null | grep -c '"verified": true' || echo 0),
  "corrections_applied": $(cat "$CORRECTIONS_FILE" 2>/dev/null | grep -c '"id"' || echo 0),
  "database_version": "5.0-with-corrections"
}
EOF

log "=== 维护完成 ==="
log "摘要:"
cat "$SUMMARY" | tee -a "$LOG_FILE"

# Cleanup old logs (keep 30 days)
find "$DATA_DIR/daily" -name "cron-*.log" -mtime +30 -delete 2>/dev/null || true
