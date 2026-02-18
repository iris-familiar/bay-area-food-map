#!/bin/bash
# 递归搜索脚本 - 基于已有餐厅深度挖掘
# ⚠️ 所有搜索已自动添加'湾区'限定

# 生成时间: 2026-02-15T15:04:02.194243
# 餐厅数量: 21

# 配置
OUTPUT_DIR="raw/recursive_$(date +%Y%m%d)"
mkdir -p $OUTPUT_DIR

# 延迟配置（防封）
DELAY_BETWEEN_REQUESTS=5  # 秒

echo "🚀 开始递归搜索..."

# 香锅大王 [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 香锅大王"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 香锅大王 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 香锅大王 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 香锅大王 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Aceking麻辣烫 [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Aceking麻辣烫"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Aceking麻辣烫 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Aceking麻辣烫 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Aceking麻辣烫 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 塔里木 [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 塔里木"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 塔里木 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 塔里木 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 塔里木 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Z&Y Restaurant [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Z&Y Restaurant"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Z&Y Restaurant 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Z&Y Restaurant 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Z&Y Restaurant 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Tamarine Restaurant [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Tamarine Restaurant"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Tamarine Restaurant"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Tamarine Restaurant 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Tamarine Restaurant 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Tamarine Restaurant 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Tamarine Restaurant 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Shoji [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Shoji"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shoji"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Shoji 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shoji 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Shoji 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shoji 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Noren Izakaya [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Noren Izakaya"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Noren Izakaya"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Noren Izakaya 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Noren Izakaya 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Noren Izakaya 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Noren Izakaya 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 杨裕兴 [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 杨裕兴"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 杨裕兴"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 杨裕兴 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 杨裕兴 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 杨裕兴 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 杨裕兴 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 阿拉上海 [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 阿拉上海"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 阿拉上海"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 阿拉上海 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 阿拉上海 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 阿拉上海 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 阿拉上海 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Shanghai Flavor [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Shanghai Flavor"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shanghai Flavor"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Shanghai Flavor 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shanghai Flavor 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Shanghai Flavor 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Shanghai Flavor 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Katsu Gin [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Katsu Gin"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Katsu Gin"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Katsu Gin 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Katsu Gin 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Katsu Gin 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Katsu Gin 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Wooga Gamjatang [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Wooga Gamjatang"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Wooga Gamjatang"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Wooga Gamjatang 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Wooga Gamjatang 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Wooga Gamjatang 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Wooga Gamjatang 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Ushiya AYCE [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Ushiya AYCE"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Ushiya AYCE"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Ushiya AYCE 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Ushiya AYCE 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Ushiya AYCE 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Ushiya AYCE 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Kunjip Tofu [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Kunjip Tofu"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Kunjip Tofu"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Kunjip Tofu 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Kunjip Tofu 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Kunjip Tofu 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Kunjip Tofu 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Indo Restaurant [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Indo Restaurant"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Indo Restaurant"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Indo Restaurant 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Indo Restaurant 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Indo Restaurant 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Indo Restaurant 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Das Bierhauz [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Das Bierhauz"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Das Bierhauz"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Das Bierhauz 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Das Bierhauz 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Das Bierhauz 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Das Bierhauz 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Cali Spartan Mexican Kitchen [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Cali Spartan Mexican Kitchen"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Cali Spartan Mexican Kitchen"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Cali Spartan Mexican Kitchen 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Cali Spartan Mexican Kitchen 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Cali Spartan Mexican Kitchen 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Cali Spartan Mexican Kitchen 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# Mikiya / Chubby Cattle [high] - 只有1个来源，需要补充基础信息
echo "搜索: 湾区 Mikiya / Chubby Cattle"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Mikiya / Chubby Cattle"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Mikiya / Chubby Cattle 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Mikiya / Chubby Cattle 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 Mikiya / Chubby Cattle 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 Mikiya / Chubby Cattle 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 留湘 [high] - 热门餐厅（4个来源, 468互动），持续追踪最新评价
echo "搜索: 湾区 留湘"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 留湘"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 留湘 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 留湘 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 留湘 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 留湘 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 顾湘 [medium] - 中等热度（3个来源），定期更新
echo "搜索: 湾区 顾湘"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 顾湘"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 顾湘 怎么样"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 顾湘 怎么样"
sleep $DELAY_BETWEEN_REQUESTS
echo "搜索: 湾区 顾湘 推荐"
# python3 scripts/fetch_xiaohongshu_data.sh "湾区 顾湘 推荐"
sleep $DELAY_BETWEEN_REQUESTS

# 王家味 [low] - 数据充足（4个来源），降低频率
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