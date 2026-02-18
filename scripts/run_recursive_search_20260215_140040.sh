#!/bin/bash
# 递归搜索脚本 - 基于已有餐厅深度挖掘
# ⚠️ 所有搜索已自动添加'湾区'限定

# 生成时间: 2026-02-15T14:00:40.148213
# 餐厅数量: 21

# 配置
OUTPUT_DIR="raw/recursive_$(date +%Y%m%d)"
mkdir -p $OUTPUT_DIR

# 延迟配置（防封）
DELAY_BETWEEN_REQUESTS=5  # 秒

echo "🚀 开始递归搜索..."

# 香锅大王 (high priority)
echo "搜索: 湾区 香锅大王"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 香锅大王 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 香锅大王 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Aceking麻辣烫 (high priority)
echo "搜索: 湾区 Aceking麻辣烫"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Aceking麻辣烫 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Aceking麻辣烫 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 塔里木 (high priority)
echo "搜索: 湾区 塔里木"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 塔里木 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 塔里木 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Z&Y Restaurant (high priority)
echo "搜索: 湾区 Z&Y Restaurant"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Z&Y Restaurant 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Z&Y Restaurant 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 王家味 (low priority)
echo "搜索: 湾区 王家味"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 王家味"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 王家味 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 王家味 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 王家味 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 王家味 推荐"
sleep $DELAY_BETWEEN_REQUESTS

echo "✅ 递归搜索完成"
echo "输出目录: $OUTPUT_DIR"