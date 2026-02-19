#!/bin/bash
# =============================================================================
# Daily Data Pipeline - Simplified Version
# 简化的每日数据处理管道
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DATA_DIR="${PROJECT_DIR}/data"
readonly LOGS_DIR="${PROJECT_DIR}/logs"
readonly BACKUP_DIR="${DATA_DIR}/backup"

readonly RUN_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly RUN_DATE=$(date +%Y-%m-%d)

mkdir -p "$LOGS_DIR" "$BACKUP_DIR"

# =============================================================================
# 日志函数
# =============================================================================
log() { echo "[$(date '+%H:%M:%S')] $1"; }
error() { echo "[$(date '+%H:%M:%S')] [ERROR] $1"; }

# =============================================================================
# 主流程
# =============================================================================
log "=== Daily Pipeline Starting ==="
log "Date: $RUN_DATE"

# Step 1: 备份
log "Step 1: Creating backup..."
BACKUP_PATH="${BACKUP_DIR}/daily_${RUN_TIMESTAMP}"
mkdir -p "$BACKUP_PATH"
cp "$DATA_DIR/current/restaurant_database.json" "$BACKUP_PATH/"
cp -r "$DATA_DIR/serving" "$BACKUP_PATH/" 2>/dev/null || true
echo "$BACKUP_PATH" > "${DATA_DIR}/_meta/last_backup.txt"
log "✅ Backup created: $BACKUP_PATH"

# Step 2: 创建恢复脚本
cat > "$BACKUP_PATH/restore.sh" << EOF
#!/bin/bash
cd "$PROJECT_DIR"
cp "$BACKUP_PATH/restaurant_database.json" data/current/
echo "✅ Restored"
EOF
chmod +x "$BACKUP_PATH/restore.sh"

# Step 3: 数据流验证
log "Step 2: Verifying data flow..."
BEFORE=$(node -e "console.log(require('$DATA_DIR/current/restaurant_database.json').restaurants.length)")
log "Current restaurants: $BEFORE"

# Step 4: 模拟数据处理 (实际使用时替换为真实爬取和处理)
log "Step 3: Processing data..."
# 这里应该是:
# 1. 爬取新数据
# 2. 清洗 → bronze/
# 3. 标准化 → silver/
# 4. 合并 → gold/
# 5. 导出 → serving/

# 简化: 直接验证现有数据一致性
AFTER=$(node -e "console.log(require('$DATA_DIR/current/restaurant_database.json').restaurants.length)")
log "After processing: $AFTER restaurants"

if [ "$AFTER" -lt "$BEFORE" ]; then
    error "Data loss detected! Restoring..."
    cp "$BACKUP_PATH/restaurant_database.json" "$DATA_DIR/current/"
    exit 1
fi

# Step 5: 验证Serving层
log "Step 4: Verifying serving layer..."
if [ -f "$DATA_DIR/serving/serving_data.json" ]; then
    SERVING=$(node -e "console.log(require('$DATA_DIR/serving/serving_data.json').restaurants.length)")
    log "Serving layer: $SERVING restaurants"
    
    if [ "$SERVING" != "$AFTER" ]; then
        error "Serving layer mismatch!"
        # 重新导出
        node -e "
const fs = require('fs');
const data = require('$DATA_DIR/current/restaurant_database.json');
fs.writeFileSync('$DATA_DIR/serving/serving_data.json', JSON.stringify(data, null, 2));
" && log "✅ Serving layer regenerated"
    fi
else
    # 创建serving数据
    cp "$DATA_DIR/current/restaurant_database.json" "$DATA_DIR/serving/serving_data.json"
    log "✅ Serving layer created"
fi

# Step 6: 最终验证
log "Step 5: Final verification..."
FINAL=$(node -e "console.log(require('$DATA_DIR/serving/serving_data.json').restaurants.length)")
log "Final count: $FINAL restaurants"

# Step 7: 记录元数据
mkdir -p "${DATA_DIR}/_meta"
echo "{\"date\":\"$RUN_DATE\",\"count\":$FINAL,\"backup\":\"$BACKUP_PATH\"}" > "${DATA_DIR}/_meta/last_run.json"

log ""
log "✅ Pipeline completed successfully"
log "Backup: $BACKUP_PATH"
log "Restore: bash $BACKUP_PATH/restore.sh"
