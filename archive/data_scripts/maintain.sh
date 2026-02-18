#!/bin/bash
# 快速维护脚本
# Usage: ./maintain.sh

echo "🔄 开始维护语义搜索映射..."
echo ""

cd "$(dirname "$0")"

# 检查依赖
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js"
    exit 1
fi

# 运行维护脚本
echo "📊 更新搜索映射..."
node scripts/update-search-mapping.js

echo ""
echo "✨ 维护完成！"
echo ""
echo "下一步："
echo "  1. 检查上面的统计信息"
echo "  2. 如有需要，编辑 data/search_mapping.yaml 手动调整"
echo "  3. 测试 index.html 确认搜索效果"
echo "  4. git commit 提交变更"
