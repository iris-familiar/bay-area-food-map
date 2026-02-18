#!/bin/bash
# 递归搜索脚本 - 基于已有餐厅深度挖掘
# ⚠️ 所有搜索已自动添加'湾区'限定

# 生成时间: 2026-02-18T11:00:00.516299
# 餐厅数量: 79

# 配置
cd ~/.openclaw/skills/xiaohongshu || exit 1
OUTPUT_DIR="${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map/raw/recursive_$(date +%Y%m%d)"
mkdir -p $OUTPUT_DIR

# 延迟配置（防封）
DELAY_BETWEEN_REQUESTS=10  # 秒
MAX_POSTS_PER_QUERY=3  # 每个搜索词最多3个帖子

echo "🚀 开始递归搜索..."

# Tanto [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 Tanto"
./scripts/search.sh "湾区 Tanto" > "$OUTPUT_DIR/recursive_Tanto_湾区_Tanto.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Tanto"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 Tanto 怎么样"
./scripts/search.sh "湾区 Tanto 怎么样" > "$OUTPUT_DIR/recursive_Tanto_湾区_Tanto_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Tanto 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# 活粥王 [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 活粥王"
./scripts/search.sh "湾区 活粥王" > "$OUTPUT_DIR/recursive_活粥王_湾区_活粥王.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 活粥王"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 活粥王 怎么样"
./scripts/search.sh "湾区 活粥王 怎么样" > "$OUTPUT_DIR/recursive_活粥王_湾区_活粥王_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 活粥王 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# Jun Bistro [medium] - 中等热度（3个来源），定期更新
echo "🔍 搜索: 湾区 Jun Bistro"
./scripts/search.sh "湾区 Jun Bistro" > "$OUTPUT_DIR/recursive_Jun Bistro_湾区_Jun_Bistro.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Jun Bistro"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 Jun Bistro 怎么样"
./scripts/search.sh "湾区 Jun Bistro 怎么样" > "$OUTPUT_DIR/recursive_Jun Bistro_湾区_Jun_Bistro_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Jun Bistro 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# 麻辣诱惑 [medium] - 中等热度（3个来源），定期更新
echo "🔍 搜索: 湾区 麻辣诱惑"
./scripts/search.sh "湾区 麻辣诱惑" > "$OUTPUT_DIR/recursive_麻辣诱惑_湾区_麻辣诱惑.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 麻辣诱惑"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 麻辣诱惑 怎么样"
./scripts/search.sh "湾区 麻辣诱惑 怎么样" > "$OUTPUT_DIR/recursive_麻辣诱惑_湾区_麻辣诱惑_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 麻辣诱惑 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# 留湘小聚 [low] - 数据充足（5个来源），降低频率
echo "🔍 搜索: 湾区 留湘小聚"
./scripts/search.sh "湾区 留湘小聚" > "$OUTPUT_DIR/recursive_留湘小聚_湾区_留湘小聚.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 留湘小聚"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 留湘小聚 怎么样"
./scripts/search.sh "湾区 留湘小聚 怎么样" > "$OUTPUT_DIR/recursive_留湘小聚_湾区_留湘小聚_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 留湘小聚 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

echo "✅ 递归搜索完成"
echo "输出目录: $OUTPUT_DIR"

# 汇总结果
cd ${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map
echo "📊 本次递归搜索发现: $(ls $OUTPUT_DIR/*.json 2>/dev/null | wc -l) 个结果文件"