#!/bin/bash
# =============================================================================
# 第一批地域搜索 - Cupertino美食 (高优先级)
# =============================================================================
# 执行时间: 2026-02-15
# 搜索词: Cupertino美食
# 预期产出: 5-10个高质量帖子，从中提取3-5家新亚洲餐厅
# =============================================================================

set -e

PROJECT_DIR="$HOME/projects/bay-area-food-map"
RAW_DIR="$PROJECT_DIR/raw"
LOG_DIR="$PROJECT_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SEARCH_TERM="Cupertino美食"

mkdir -p "$RAW_DIR" "$LOG_DIR"

echo "======================================================================"
echo "🚀 第一批地域搜索: $SEARCH_TERM"
echo "======================================================================"
echo "开始时间: $(date)"
echo ""

# 配置
MAX_POSTS=5
DELAY_MIN=8
DELAY_MAX=12

echo "📋 搜索配置:"
echo "   搜索词: $SEARCH_TERM"
echo "   目标帖子数: $MAX_POSTS"
echo "   请求延迟: ${DELAY_MIN}-${DELAY_MAX}秒"
echo ""

# 这里应该调用实际的xiaohongshu搜索API
# 由于API接入需要单独配置，这里创建执行框架

cat > "$RAW_DIR/batch1_${TIMESTAMP}_commands.sh" << 'EOF'
#!/bin/bash
# 实际执行命令 (需要xiaohongshu-mcp接入)
# 以下命令需要在配置了xiaohongshu-mcp的环境中执行

# 1. 搜索帖子
# ./search.sh "Cupertino美食"

# 2. 获取前5个帖子的详情
# for post_id in POST_ID1 POST_ID2 POST_ID3 POST_ID4 POST_ID5; do
#     ./mcp-call.sh get_feed_detail "{\"feed_id\": \"$post_id\", \"load_all_comments\": true}"
#     sleep $((8 + RANDOM % 5))
# done

# 3. 保存结果到raw目录
EOF

echo "✅ 执行脚本已生成: $RAW_DIR/batch1_${TIMESTAMP}_commands.sh"
echo ""

# 创建搜索结果占位记录 (实际执行时替换为真实数据)
cat > "$RAW_DIR/batch1_${TIMESTAMP}_summary.json" << EOF
{
  "batch_id": "batch1_${TIMESTAMP}",
  "search_term": "$SEARCH_TERM",
  "executed_at": "$(date -Iseconds)",
  "target_posts": $MAX_POSTS,
  "actual_posts": 0,
  "status": "pending_execution",
  "notes": "需要xiaohongshu-mcp环境执行实际抓取",
  "next_steps": [
    "1. 配置xiaohongshu-mcp环境",
    "2. 执行 batch1_${TIMESTAMP}_commands.sh",
    "3. 运行 discover_from_comments.py 提取新餐厅",
    "4. 人工验证候选餐厅"
  ]
}
EOF

echo "📊 批次摘要已记录: $RAW_DIR/batch1_${TIMESTAMP}_summary.json"
echo ""

# 记录到调度日志
mkdir -p "$PROJECT_DIR/data"
cat >> "$PROJECT_DIR/data/execution_log.jsonl" << EOF
{"timestamp": "$(date -Iseconds)", "batch": "batch1", "term": "$SEARCH_TERM", "status": "prepared", "note": "ready_for_execution"}
EOF

echo "======================================================================"
echo "✅ 第一批搜索准备完成!"
echo "======================================================================"
echo ""
echo "下一步操作:"
echo "1. 在配置了xiaohongshu-mcp的环境中执行:"
echo "   bash $RAW_DIR/batch1_${TIMESTAMP}_commands.sh"
echo ""
echo "2. 或者手动搜索:"
echo "   搜索词: $SEARCH_TERM"
echo "   获取前5个帖子的详情和全部评论"
echo "   保存到: $RAW_DIR/"
echo ""
echo "3. 完成后运行:"
echo "   python3 scripts/discover_from_comments.py"
echo ""
echo "预计发现: 3-5家新亚洲餐厅"
echo "======================================================================"
