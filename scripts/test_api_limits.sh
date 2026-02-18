#!/bin/bash
# =============================================================================
# 测试小红书API限制
# 帮助确定每天/每小时可以安全调用多少次
# =============================================================================

set -e

PROJECT_DIR="${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map"
cd "$PROJECT_DIR"

echo "======================================================================"
echo "🧪 测试小红书API限制"
echo "======================================================================"
echo ""
echo "这个测试会连续调用小红书API，观察何时触发限制"
echo ""

# 从数据库中获取一些帖子ID进行测试
POST_ID=$(cat data/current/restaurant_database_v5_ui.json | jq -r '.restaurants[0].sources[0]')

echo "测试帖子ID: $POST_ID"
echo ""

# 测试1: 连续调用
echo "测试1: 连续快速调用 (间隔0秒)"
echo "----------------------------------------------------------------------"
for i in {1..10}; do
    echo -n "[$i/10] "
    START=$(date +%s%N)
    
    if cd ~/.openclaw/skills/xiaohongshu && ./scripts/mcp-call.sh get_note_by_id "{\"note_id\": \"$POST_ID\"}" > /dev/null 2>&1; then
        END=$(date +%s%N)
        DURATION=$(( (END - START) / 1000000 ))
        echo "✅ 成功 (${DURATION}ms)"
    else
        echo "❌ 失败 (可能触发限制)"
        break
    fi
done

echo ""
echo "测试2: 间隔1秒调用"
echo "----------------------------------------------------------------------"
for i in {1..10}; do
    echo -n "[$i/10] "
    START=$(date +%s%N)
    
    if cd ~/.openclaw/skills/xiaohongshu && ./scripts/mcp-call.sh get_note_by_id "{\"note_id\": \"$POST_ID\"}" > /dev/null 2>&1; then
        END=$(date +%s%N)
        DURATION=$(( (END - START) / 1000000 ))
        echo "✅ 成功 (${DURATION}ms)"
    else
        echo "❌ 失败"
        break
    fi
    
    sleep 1
done

echo ""
echo "======================================================================"
echo "测试完成"
echo "======================================================================"
echo ""
echo "建议:"
echo "  1. 如果测试1全部成功 → API限制很宽松，可提高更新数量"
echo "  2. 如果测试1失败但测试2成功 → 需要间隔，建议保持当前设置"
echo "  3. 如果都失败 → API可能有其他限制，需要进一步调查"
echo ""
echo "如需调整更新数量，编辑:"
echo "  scripts/update_post_engagement.js"
echo "  修改: const MAX_UPDATES_PER_DAY = 20;"
echo ""
