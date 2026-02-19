#!/bin/bash
# =============================================================================
# Cron Job Test - Pull New Data Simulation
# 模拟未来pull新数据的cron job测试
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DATA_DIR="${PROJECT_DIR}/data"
readonly BACKUP_DIR="${DATA_DIR}/backup"
readonly LOGS_DIR="${PROJECT_DIR}/logs"

readonly RUN_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly RUN_DATE=$(date +%Y-%m-%d)
readonly TEST_ID="cron_test_${RUN_TIMESTAMP}"

# 日志文件
readonly MAIN_LOG="${LOGS_DIR}/cron_test_${RUN_DATE}.log"
readonly ERROR_LOG="${LOGS_DIR}/cron_test_error_${RUN_DATE}.log"

# 创建日志目录
mkdir -p "$LOGS_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MAIN_LOG"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$ERROR_LOG" "$MAIN_LOG"
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

log "=== Cron Job Test Started: $TEST_ID ==="
log "Project Dir: $PROJECT_DIR"
log "Data Dir: $DATA_DIR"

# 检查关键目录
if [ ! -d "$DATA_DIR/current" ]; then
    error "Data directory not found: $DATA_DIR/current"
    exit 1
fi

if [ ! -f "$DATA_DIR/current/restaurant_database.json" ]; then
    error "Restaurant database not found"
    exit 1
fi

log "✅ Pre-flight checks passed"

# =============================================================================
# BACKUP CURRENT DATA (Fallback Safety)
# =============================================================================

log "=== Creating Backup (Fallback Safety) ==="

BACKUP_PATH="${BACKUP_DIR}/cron_test_backup_${RUN_TIMESTAMP}"
mkdir -p "$BACKUP_PATH"

# 备份当前数据
cp -r "$DATA_DIR/current" "$BACKUP_PATH/" 2>/dev/null || true
cp -r "$DATA_DIR/serving" "$BACKUP_PATH/" 2>/dev/null || true

# 创建恢复脚本
cat > "$BACKUP_PATH/restore.sh" << RESTOREEOF
#!/bin/bash
# Auto-generated restore script for $TEST_ID
# Run this to restore data to pre-test state

cd "$PROJECT_DIR"
cp -r "$BACKUP_PATH/current"/* "$DATA_DIR/current/" 2>/dev/null || true
cp -r "$BACKUP_PATH/serving"/* "$DATA_DIR/serving/" 2>/dev/null || true
echo "✅ Data restored from $BACKUP_PATH"
RESTOREEOF

chmod +x "$BACKUP_PATH/restore.sh"

log "✅ Backup created: $BACKUP_PATH"
log "✅ Restore script: $BACKUP_PATH/restore.sh"

# =============================================================================
# SIMULATE PULLING NEW DATA
# =============================================================================

log "=== Simulating New Data Pull ==="

# 创建模拟的新数据目录
NEW_DATA_DIR="${DATA_DIR}/new_data_${RUN_TIMESTAMP}"
mkdir -p "$NEW_DATA_DIR"

# 复制现有数据作为基础
cp "$DATA_DIR/current/restaurant_database.json" "$NEW_DATA_DIR/"

# 模拟添加新餐厅数据
log "Adding simulated new restaurant data..."

# 使用Node.js处理JSON
node << NODEEOF
const fs = require('fs');
const path = require('path');

const newDataDir = '$NEW_DATA_DIR';
const dbPath = path.join(newDataDir, 'restaurant_database.json');

// 读取现有数据
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 记录原始数量
const originalCount = data.restaurants.length;
console.log('Original restaurant count:', originalCount);

// 模拟添加新餐厅 (复制最后一个并修改)
const lastRestaurant = data.restaurants[data.restaurants.length - 1];
const newRestaurant = {
    ...lastRestaurant,
    id: 'new_test_' + Date.now(),
    name: 'Test New Restaurant ' + new Date().toISOString().split('T')[0],
    engagement: Math.floor(Math.random() * 1000) + 100,
    xiaohongshu_id: 'test_' + Math.random().toString(36).substr(2, 9),
    post_details: [{
        note_id: 'test_note_' + Date.now(),
        title: 'Test new data from cron job',
        engagement: Math.floor(Math.random() * 500),
        published_at: new Date().toISOString()
    }]
};

data.restaurants.push(newRestaurant);
data.total_count = data.restaurants.length;
data.metadata = data.metadata || {};
data.metadata.last_cron_run = new Date().toISOString();
data.metadata.cron_test_id = '$TEST_ID';

// 保存新数据
fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

console.log('New restaurant count:', data.restaurants.length);
console.log('Added test restaurant:', newRestaurant.name);
NODEEOF

log "✅ New data simulation completed"

# =============================================================================
# MERGE NEW DATA (ETL Pipeline)
# =============================================================================

log "=== Running ETL Pipeline ==="

cd "$PROJECT_DIR"

# 运行ETL合并
if [ -f "src/etl/merge.js" ]; then
    log "Running merge.js to integrate new data..."
    node src/etl/merge.js \
        --input "$NEW_DATA_DIR/restaurant_database.json" \
        --output "$DATA_DIR/current/restaurant_database.json" \
        --mode smart --golden-path "''/golden/current/restaurant_database.json" 2>&1 | tee -a "$MAIN_LOG" || {
        error "ETL merge failed"
        # Restore from backup
        log "Restoring from backup..."
        bash "$BACKUP_PATH/restore.sh"
        exit 1
    }
    log "✅ ETL merge completed"
else
    # 简单复制作为fallback
    log "ETL merge script not found, using simple copy"
    cp "$NEW_DATA_DIR/restaurant_database.json" "$DATA_DIR/current/"
    log "✅ Data copied"
fi

# =============================================================================
# UPDATE SERVING LAYER
# =============================================================================

log "=== Updating Serving Layer ==="

# 导出到服务层
if [ -f "src/api/export_to_serving.js" ]; then
    log "Exporting to serving layer..."
    node src/api/export_to_serving.js \
        --input "$DATA_DIR/current/restaurant_database.json" \
        --output-dir "$DATA_DIR/serving" 2>&1 | tee -a "$MAIN_LOG" || {
        error "Export to serving failed"
        log "Restoring from backup..."
        bash "$BACKUP_PATH/restore.sh"
        exit 1
    }
    log "✅ Serving layer updated"
else
    log "⚠️ Export script not found, serving layer not updated"
fi

# =============================================================================
# VERIFICATION
# =============================================================================

log "=== Running Verification ==="

# 验证数据完整性
node << VERIFYEOF
const fs = require('fs');
const path = require('path');

const dbPath = '$DATA_DIR/current/restaurant_database.json';
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('Verification Results:');
console.log('- Total restaurants:', data.restaurants.length);
console.log('- Has metadata:', !!data.metadata);
console.log('- Last cron run:', data.metadata?.last_cron_run || 'N/A');

// 检查是否有新添加的测试餐厅
const testRestaurants = data.restaurants.filter(r => r.id.startsWith('new_test_'));
console.log('- Test restaurants added:', testRestaurants.length);

// 验证关键字段
const requiredFields = ['id', 'name', 'cuisine', 'city', 'region', 'engagement'];
const sample = data.restaurants[0];
const missingFields = requiredFields.filter(f => !sample[f]);

if (missingFields.length > 0) {
    console.error('❌ Missing fields:', missingFields);
    process.exit(1);
}

console.log('✅ All required fields present');
VERIFYEOF

if [ $? -eq 0 ]; then
    log "✅ Verification passed"
else
    error "Verification failed, restoring..."
    bash "$BACKUP_PATH/restore.sh"
    exit 1
fi

# =============================================================================
# CLEANUP
# =============================================================================

log "=== Cleanup ==="

# 保留最新的5个备份
ls -t "$BACKUP_DIR"/cron_test_backup_* 2>/dev/null | tail -n +6 | xargs -r rm -rf

# 删除临时新数据
rm -rf "$NEW_DATA_DIR"

log "✅ Cleanup completed"

# =============================================================================
# SUMMARY
# =============================================================================

log "=== Cron Job Test Summary ==="
log "Test ID: $TEST_ID"
log "Backup Location: $BACKUP_PATH"
log "Restore Command: bash $BACKUP_PATH/restore.sh"
log "Status: ✅ SUCCESS"
log "=== Test Completed ==="

exit 0
