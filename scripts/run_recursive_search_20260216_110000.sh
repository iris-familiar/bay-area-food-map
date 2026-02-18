#!/bin/bash
# 递归搜索脚本 - 基于已有餐厅深度挖掘
# ⚠️ 所有搜索已自动添加'湾区'限定

# 生成时间: 2026-02-16T11:00:00.339495
# 餐厅数量: 49

# 配置
cd ~/.openclaw/skills/xiaohongshu || exit 1
OUTPUT_DIR="${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map/raw/recursive_$(date +%Y%m%d)"
mkdir -p $OUTPUT_DIR

# 延迟配置（防封）
DELAY_BETWEEN_REQUESTS=10  # 秒
MAX_POSTS_PER_QUERY=3  # 每个搜索词最多3个帖子

echo "🚀 开始递归搜索..."

# 香锅大王 [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 香锅大王"
./scripts/search.sh "湾区 香锅大王" > "$OUTPUT_DIR/recursive_香锅大王_湾区_香锅大王.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 香锅大王"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 香锅大王 怎么样"
./scripts/search.sh "湾区 香锅大王 怎么样" > "$OUTPUT_DIR/recursive_香锅大王_湾区_香锅大王_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 香锅大王 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# Aceking麻辣烫 [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 Aceking麻辣烫"
./scripts/search.sh "湾区 Aceking麻辣烫" > "$OUTPUT_DIR/recursive_Aceking麻辣烫_湾区_Aceking麻辣烫.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Aceking麻辣烫"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 Aceking麻辣烫 怎么样"
./scripts/search.sh "湾区 Aceking麻辣烫 怎么样" > "$OUTPUT_DIR/recursive_Aceking麻辣烫_湾区_Aceking麻辣烫_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Aceking麻辣烫 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# 塔里木 [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 塔里木"
./scripts/search.sh "湾区 塔里木" > "$OUTPUT_DIR/recursive_塔里木_湾区_塔里木.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 塔里木"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 塔里木 怎么样"
./scripts/search.sh "湾区 塔里木 怎么样" > "$OUTPUT_DIR/recursive_塔里木_湾区_塔里木_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 塔里木 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# Z&Y Restaurant [high] - 只有1个来源，需要补充基础信息
echo "🔍 搜索: 湾区 Z&Y Restaurant"
./scripts/search.sh "湾区 Z&Y Restaurant" > "$OUTPUT_DIR/recursive_Z&Y Restaurant_湾区_Z&Y_Restaurant.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Z&Y Restaurant"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 Z&Y Restaurant 怎么样"
./scripts/search.sh "湾区 Z&Y Restaurant 怎么样" > "$OUTPUT_DIR/recursive_Z&Y Restaurant_湾区_Z&Y_Restaurant_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 Z&Y Restaurant 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

# 王家味 [low] - 数据充足（4个来源），降低频率
echo "🔍 搜索: 湾区 王家味"
./scripts/search.sh "湾区 王家味" > "$OUTPUT_DIR/recursive_王家味_湾区_王家味.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 王家味"
sleep $DELAY_BETWEEN_REQUESTS
echo "🔍 搜索: 湾区 王家味 怎么样"
./scripts/search.sh "湾区 王家味 怎么样" > "$OUTPUT_DIR/recursive_王家味_湾区_王家味_怎么样.json" 2>&1 || echo "⚠️ 搜索失败: 湾区 王家味 怎么样"
sleep $DELAY_BETWEEN_REQUESTS

echo "✅ 递归搜索完成"
echo "输出目录: $OUTPUT_DIR"

# 汇总结果
cd ${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map
echo "📊 本次递归搜索发现: $(ls $OUTPUT_DIR/*.json 2>/dev/null | wc -l) 个结果文件"