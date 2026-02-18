#!/bin/bash
# =============================================================================
# 设置自动化 - One-time setup
# =============================================================================

echo "======================================================================"
echo "🤖 设置自动化任务"
echo "======================================================================"
echo ""

PROJECT_DIR="$HOME/projects/bay-area-food-map"

# 1. 创建必要的目录
echo "📁 创建目录结构..."
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/data/archive"
mkdir -p "$PROJECT_DIR/raw/processed"
echo "✅ 目录创建完成"
echo ""

# 2. 安装cron任务
echo "📅 安装定时任务..."
if command -v crontab &> /dev/null; then
    # 备份现有crontab
    crontab -l > "$PROJECT_DIR/config/crontab_backup_$(date +%Y%m%d).txt" 2>/dev/null || true
    
    # 安装新crontab
    crontab "$PROJECT_DIR/config/crontab.txt"
    
    echo "✅ Cron任务已安装"
    echo ""
    echo "当前定时任务:"
    crontab -l | grep -v "^#" | grep -v "^$" || echo "   (无任务)"
else
    echo "⚠️  crontab命令不可用，请手动安装定时任务"
    echo "   配置文件: $PROJECT_DIR/config/crontab.txt"
fi
echo ""

# 3. 创建执行日志记录器
cat > "$PROJECT_DIR/scripts/log_executor.py" << 'EOF'
#!/usr/bin/env python3
"""执行日志记录器"""
import json
import sys
from datetime import datetime

def log_execution(task_type, status, details=None):
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "task": task_type,
        "status": status,
        "details": details or {}
    }
    
    with open("data/execution_log.jsonl", "a") as f:
        f.write(json.dumps(log_entry) + "\n")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        log_execution(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
EOF

chmod +x "$PROJECT_DIR/scripts/log_executor.py"
echo "✅ 日志记录器已创建"
echo ""

# 4. 创建状态检查脚本
cat > "$PROJECT_DIR/scripts/check_status.sh" << 'EOF'
#!/bin/bash
# 检查项目状态

echo "======================================================================"
echo "📊 Bay Area Food Map - 项目状态"
echo "======================================================================"
echo ""

# 统计餐厅数量
if [ -f "data/current/restaurant_database.json" ]; then
    COUNT=$(grep -c '"id": "r' data/current/restaurant_database.json)
    echo "🍴 当前餐厅数量: $COUNT"
    echo "   目标: 100家"
    echo "   进度: $((COUNT))%"
else
    echo "⚠️  数据库文件不存在"
fi
echo ""

# 统计今日抓取
if [ -f "data/execution_log.jsonl" ]; then
    TODAY=$(date +%Y-%m-%d)
    TODAY_COUNT=$(grep "$TODAY" data/execution_log.jsonl | wc -l)
    echo "📈 今日执行批次: $TODAY_COUNT"
fi
echo ""

# 统计raw文件
RAW_COUNT=$(ls raw/feed_*.json 2>/dev/null | wc -l)
echo "📁 Raw数据文件: $RAW_COUNT"
echo ""

# 检查cron状态
if crontab -l 2>/dev/null | grep -q "bay-area-food-map"; then
    echo "✅ 自动化任务: 已启用"
else
    echo "⚠️  自动化任务: 未启用"
fi
echo ""

echo "======================================================================"
EOF

chmod +x "$PROJECT_DIR/scripts/check_status.sh"
echo "✅ 状态检查脚本已创建"
echo ""

# 5. 创建启动脚本
cat > "$PROJECT_DIR/start.sh" << 'EOF'
#!/bin/bash
# 快速启动 - 显示今日任务

cd "$(dirname "$0")"
./scripts/daily_checklist.sh
EOF

chmod +x "$PROJECT_DIR/start.sh"
echo "✅ 启动脚本已创建: ./start.sh"
echo ""

echo "======================================================================"
echo "✅ 自动化设置完成!"
echo "======================================================================"
echo ""
echo "快速开始:"
echo "   cd ~/projects/bay-area-food-map"
echo "   ./start.sh                    # 查看今日任务"
echo "   ./scripts/check_status.sh     # 查看项目状态"
echo ""
echo "手动执行搜索:"
echo "   ./scripts/batch1_cuperino_search.sh  # Cupertino美食"
echo ""
echo "查看日志:"
echo "   tail -f logs/*.log"
echo ""
echo "======================================================================"
