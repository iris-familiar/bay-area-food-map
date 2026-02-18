#!/bin/bash
# STRICT GOVERNANCE: 网站完整验证脚本
# 验证网站所有功能正常工作

set -e  # 任何命令失败则退出

echo "🔍 开始完整验证..."
cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# 1. 验证数据完整性
echo "\n[1/5] 验证数据完整性..."
node scripts/verify_data_integrity.js || {
    echo "❌ 数据验证失败"
    exit 1
}

# 2. 验证文件结构
echo "\n[2/5] 验证文件结构..."
if [ ! -L "data/current/restaurant_database.json" ]; then
    echo "❌ database文件不是symlink"
    exit 1
fi
echo "✓ database文件是symlink"

# 3. 验证HTML文件存在且格式正确
echo "\n[3/5] 验证HTML文件..."
if [ ! -f "index.html" ]; then
    echo "❌ index.html不存在"
    exit 1
fi

# 检查关键元素
if ! grep -q "restaurant_database.json" index.html; then
    echo "❌ HTML中缺少数据库引用"
    exit 1
fi

if ! grep -q "google.com/maps" index.html; then
    echo "❌ HTML中缺少Google Maps链接"
    exit 1
fi

if ! grep -q "xiaohongshu.com" index.html; then
    echo "❌ HTML中缺少小红书链接"
    exit 1
fi

echo "✓ HTML文件验证通过"

# 4. 验证服务器可访问性
echo "\n[4/5] 验证服务器..."
if ! curl -s http://localhost:8080 > /dev/null; then
    echo "❌ 服务器无法访问"
    exit 1
fi
echo "✓ 服务器运行正常"

# 5. 验证API端点
echo "\n[5/5] 验证API端点..."
if ! curl -s http://localhost:8080/data/current/restaurant_database.json > /dev/null; then
    echo "❌ 数据库API无法访问"
    exit 1
fi
echo "✓ API端点正常"

echo ""
echo "=================================================="
echo "✅ 所有验证通过！网站完全可用。"
echo "=================================================="
