#!/bin/bash
# =============================================================================
# Daily Data Pipeline - 每日数据闭环处理脚本
# 
# 理想工作流:
# 1. 爬取新数据 → raw/
# 2. 预处理 → bronze/ → silver/ → gold/
# 3. 生成服务数据 → serving/
# 4. 前端实时连接最新数据
# =============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DATA_DIR="${PROJECT_DIR}/data"
readonly LOGS_DIR="${PROJECT_DIR}/logs"
readonly BACKUP_DIR="${DATA_DIR}/backup"

readonly RUN_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly RUN_DATE=$(date +%Y-%m-%d)
readonly RUN_ID="daily_${RUN_TIMESTAMP}"

# 日志文件
readonly MAIN_LOG="${LOGS_DIR}/daily_${RUN_DATE}.log"
readonly ERROR_LOG="${LOGS_DIR}/daily_error_${RUN_DATE}.log"

# 创建日志目录
mkdir -p "$LOGS_DIR" "$BACKUP_DIR"

# =============================================================================
# 日志函数
# =============================================================================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1" | tee -a "$MAIN_LOG"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" | tee -a "$ERROR_LOG" "$MAIN_LOG"
}

warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1" | tee -a "$MAIN_LOG"
}

# =============================================================================
# 步骤0: 预检
# =============================================================================
step_0_preflight() {
    log "=== Step 0: Pre-flight Checks ==="
    
    # 检查关键目录
    for dir in "$DATA_DIR" "$DATA_DIR/current" "$DATA_DIR/serving"; do
        if [ ! -d "$dir" ]; then
            error "Directory not found: $dir"
            return 1
        fi
    done
    
    # 检查关键文件
    if [ ! -f "$DATA_DIR/current/restaurant_database.json" ]; then
        error "Restaurant database not found"
        return 1
    fi
    
    # 记录当前状态
    local current_count
    current_count=$(node -e "console.log(require('$DATA_DIR/current/restaurant_database.json').restaurants.length)")
    log "Current restaurant count: $current_count"
    
    log "✅ Pre-flight checks passed"
    return 0
}

# =============================================================================
# 步骤1: 创建备份 (Fallback Safety)
# =============================================================================
step_1_backup() {
    log "=== Step 1: Creating Backup (Fallback Safety) ==="
    
    local backup_path="${BACKUP_DIR}/daily_backup_${RUN_TIMESTAMP}"
    mkdir -p "$backup_path"
    
    # 备份当前数据
    cp -r "$DATA_DIR/current" "$backup_path/" 2>/dev/null || true
    cp -r "$DATA_DIR/serving" "$backup_path/" 2>/dev/null || true
    
    # 创建恢复脚本
    cat > "$backup_path/restore.sh" << 'RESTOREEOF'
#!/bin/bash
# Auto-generated restore script
set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_DIR"
cp -r "$0/../current"/* "data/current/" 2>/dev/null || true
cp -r "$0/../serving"/* "data/serving/" 2>/dev/null || true
echo "✅ Data restored from backup"
RESTOREEOF
    chmod +x "$backup_path/restore.sh"
    
    # 记录备份信息
    echo "$backup_path" > "${DATA_DIR}/_meta/last_backup.txt"
    
    log "✅ Backup created: $backup_path"
    log "✅ Restore script: $backup_path/restore.sh"
    
    # 清理旧备份 (保留最近7天)
    find "$BACKUP_DIR" -name "daily_backup_*" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
    
    return 0
}

# =============================================================================
# 步骤2: 模拟/获取新数据 (实际使用时替换为真实爬取)
# =============================================================================
step_2_fetch_new_data() {
    log "=== Step 2: Fetching New Data ==="
    
    local raw_dir="${DATA_DIR}/raw/${RUN_DATE}"
    mkdir -p "$raw_dir"
    
    # 在实际使用中，这里应该是爬取代码
    # python3 scripts/scrape.py --output "$raw_dir"
    
    # 当前模拟：复制现有数据作为"新数据"
    cp "$DATA_DIR/current/restaurant_database.json" "$raw_dir/new_data.json"
    
    log "✅ New data saved to: $raw_dir"
    return 0
}

# =============================================================================
# 步骤3: 预处理 → Bronze
# =============================================================================
step_3_bronze() {
    log "=== Step 3: Processing → Bronze Layer ==="
    
    local bronze_dir="${DATA_DIR}/bronze/${RUN_DATE}"
    mkdir -p "$bronze_dir"
    
    # 调用clean.js进行初步清洗
    if [ -f "${PROJECT_DIR}/src/etl/clean.js" ]; then
        cd "${PROJECT_DIR}/src/etl" && node clean.js \
            --input "${DATA_DIR}/raw/${RUN_DATE}/new_data.json" \
            --output "${bronze_dir}/cleaned.json" \
            2>&1 | tee -a "$MAIN_LOG" || {
            warn "Clean failed, using fallback"
            cp "${DATA_DIR}/raw/${RUN_DATE}/new_data.json" "${bronze_dir}/cleaned.json"
        }
    else
        # Fallback: 直接复制
        cp "${DATA_DIR}/raw/${RUN_DATE}/new_data.json" "${bronze_dir}/cleaned.json"
    fi
    
    log "✅ Bronze layer created: $bronze_dir"
    return 0
}

# =============================================================================
# 步骤4: 标准化 → Silver
# =============================================================================
step_4_silver() {
    log "=== Step 4: Standardizing → Silver Layer ==="
    
    local silver_dir="${DATA_DIR}/silver/${RUN_DATE}"
    mkdir -p "$silver_dir"
    
    # 调用standardize.js进行标准化
    if [ -f "${PROJECT_DIR}/src/etl/standardize.js" ]; then
        cd "${PROJECT_DIR}/src/etl" && node standardize.js \
            --input "${DATA_DIR}/bronze/${RUN_DATE}/cleaned.json" \
            --output "${silver_dir}/standardized.json" \
            2>&1 | tee -a "$MAIN_LOG" || {
            warn "Standardize failed, using fallback"
            cp "${DATA_DIR}/bronze/${RUN_DATE}/cleaned.json" "${silver_dir}/standardized.json"
        }
    else
        # Fallback: 直接复制
        cp "${DATA_DIR}/bronze/${RUN_DATE}/cleaned.json" "${silver_dir}/standardized.json"
    fi
    
    log "✅ Silver layer created: $silver_dir"
    return 0
}

# =============================================================================
# 步骤5: 合并 → Gold (关键步骤)
# =============================================================================
step_5_gold() {
    log "=== Step 5: Merging → Gold Layer (CRITICAL) ==="
    
    local gold_dir="${DATA_DIR}/gold"
    mkdir -p "$gold_dir"
    
    # 关键修复: 确保使用正确的路径
    local current_db="${DATA_DIR}/current/restaurant_database.json"
    local new_data="${DATA_DIR}/silver/${RUN_DATE}/standardized.json"
    local output_db="${gold_dir}/restaurant_database.json"
    
    # 验证输入文件
    if [ ! -f "$current_db" ]; then
        error "Current database not found: $current_db"
        return 1
    fi
    
    if [ ! -f "$new_data" ]; then
        error "New data not found: $new_data"
        return 1
    fi
    
    # 记录合并前的数量
    local before_count
    before_count=$(node -e "console.log(require('$current_db').restaurants.length)")
    log "Restaurant count before merge: $before_count"
    
    # 调用merge.js (关键修复: 使用正确的golden路径)
    if [ -f "${PROJECT_DIR}/src/etl/merge.js" ]; then
        # 关键: 使用 --golden-path 指向正确的current数据库
        node "${PROJECT_DIR}/src/etl/merge.js" \
            --input "$new_data" \
            --output "$output_db" \
            --golden-path "$current_db" \
            --mode smart \
            2>&1 | tee -a "$MAIN_LOG" || {
            error "Gold merge failed"
            log "Restoring from backup..."
            bash "${BACKUP_DIR}/daily_backup_${RUN_TIMESTAMP}/restore.sh"
            return 1
        }
    else
        # Fallback: 简单合并 (添加新记录)
        node << NODEOF
const fs = require('fs');
const current = require('$current_db');
const newData = require('$new_data');

// 合并逻辑: 添加新记录
newData.restaurants.forEach(newRestaurant => {
    const exists = current.restaurants.find(r => r.id === newRestaurant.id);
    if (!exists) {
        current.restaurants.push(newRestaurant);
    }
});

current.total_count = current.restaurants.length;
current.metadata = current.metadata || {};
current.metadata.last_update = new Date().toISOString();

fs.writeFileSync('$output_db', JSON.stringify(current, null, 2));
console.log('Merged restaurant count:', current.restaurants.length);
NODEOF
    fi
    
    # 验证合并后的数量
    local after_count
    after_count=$(node -e "console.log(require('$output_db').restaurants.length)")
    log "Restaurant count after merge: $after_count"
    
    if [ "$after_count" -lt "$before_count" ]; then
        error "Merge lost data! Before: $before_count, After: $after_count"
        log "Restoring from backup..."
        bash "${BACKUP_DIR}/daily_backup_${RUN_TIMESTAMP}/restore.sh"
        return 1
    fi
    
    # 更新current指向新的gold
    cp "$output_db" "$current_db"
    
    log "✅ Gold layer updated: $gold_dir"
    log "✅ Current database updated"
    return 0
}

# =============================================================================
# 步骤6: 生成服务数据 → Serving
# =============================================================================
step_6_serving() {
    log "=== Step 6: Generating Serving Layer ==="
    
    local serving_dir="${DATA_DIR}/serving"
    mkdir -p "$serving_dir"
    
    # 关键修复: 导出到正确的serving目录
    if [ -f "${PROJECT_DIR}/src/api/export_to_serving.js" ]; then
        node "${PROJECT_DIR}/src/api/export_to_serving.js" \
            --input "${DATA_DIR}/gold/restaurant_database.json" \
            --output-dir "$serving_dir" \
            2>&1 | tee -a "$MAIN_LOG" || {
            error "Serving generation failed"
            return 1
        }
    else
        # Fallback: 直接复制
        cp "${DATA_DIR}/gold/restaurant_database.json" "${serving_dir}/serving_data.json"
    fi
    
    # 验证serving文件
    if [ -f "${serving_dir}/serving_data.json" ]; then
        local serving_count
        serving_count=$(node -e "console.log(require('${serving_dir}/serving_data.json').restaurants.length)")
        log "Serving layer created with $serving_count restaurants"
    fi
    
    log "✅ Serving layer updated: $serving_dir"
    return 0
}

# =============================================================================
# 步骤7: 最终验证
# =============================================================================
step_7_verify() {
    log "=== Step 7: Final Verification ==="
    
    local errors=0
    
    # 验证1: 数据文件存在
    for file in "${DATA_DIR}/current/restaurant_database.json" \
                "${DATA_DIR}/gold/restaurant_database.json" \
                "${DATA_DIR}/serving/serving_data.json"; do
        if [ ! -f "$file" ]; then
            error "Missing file: $file"
            ((errors++))
        fi
    done
    
    # 验证2: JSON格式正确
    for file in "${DATA_DIR}/current/restaurant_database.json" \
                "${DATA_DIR}/serving/serving_data.json"; do
        if ! node -e "require('$file')" 2>/dev/null; then
            error "Invalid JSON: $file"
            ((errors++))
        fi
    done
    
    # 验证3: 餐厅数量一致
    local current_count serving_count
    current_count=$(node -e "console.log(require('${DATA_DIR}/current/restaurant_database.json').restaurants.length)")
    serving_count=$(node -e "console.log(require('${DATA_DIR}/serving/serving_data.json').restaurants.length)")
    
    if [ "$current_count" != "$serving_count" ]; then
        error "Count mismatch! Current: $current_count, Serving: $serving_count"
        ((errors++))
    fi
    
    # 验证4: 前端可访问
    if [ -f "${PROJECT_DIR}/index.html" ]; then
        log "Frontend index.html exists"
    fi
    
    if [ $errors -eq 0 ]; then
        log "✅ All verifications passed"
        log "✅ Pipeline completed successfully"
        log "✅ Frontend can now access latest data"
        return 0
    else
        error "Verification failed with $errors errors"
        log "Restoring from backup..."
        bash "${BACKUP_DIR}/daily_backup_${RUN_TIMESTAMP}/restore.sh"
        return 1
    fi
}

# =============================================================================
# 步骤8: 记录元数据
# =============================================================================
step_8_metadata() {
    log "=== Step 8: Recording Metadata ==="
    
    local meta_file="${DATA_DIR}/_meta/pipeline_history.json"
    mkdir -p "${DATA_DIR}/_meta"
    
    # 创建或更新历史记录
    node << NODEOF
const fs = require('fs');
const path = '$meta_file';

let history = [];
if (fs.existsSync(path)) {
    history = JSON.parse(fs.readFileSync(path, 'utf8'));
}

history.push({
    run_id: '$RUN_ID',
    date: '$RUN_DATE',
    timestamp: new Date().toISOString(),
    restaurant_count: require('${DATA_DIR}/current/restaurant_database.json').restaurants.length,
    status: 'success'
});

// 只保留最近30条记录
history = history.slice(-30);

fs.writeFileSync(path, JSON.stringify(history, null, 2));
NODEOF
    
    log "✅ Metadata recorded"
    return 0
}

# =============================================================================
# 主流程
# =============================================================================
main() {
    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║        Daily Data Pipeline - Starting                      ║"
    log "╚════════════════════════════════════════════════════════════╝"
    log "Run ID: $RUN_ID"
    log "Date: $RUN_DATE"
    log ""
    
    # 执行所有步骤
    step_0_preflight || exit 1
    step_1_backup || exit 1
    step_2_fetch_new_data || exit 1
    step_3_bronze || exit 1
    step_4_silver || exit 1
    step_5_gold || exit 1
    step_6_serving || exit 1
    step_7_verify || exit 1
    step_8_metadata || exit 1
    
    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║        Daily Data Pipeline - Completed Successfully ✅     ║"
    log "╚════════════════════════════════════════════════════════════╝"
    log "Backup: ${BACKUP_DIR}/daily_backup_${RUN_TIMESTAMP}"
    log "Log: $MAIN_LOG"
    log ""
    
    return 0
}

# 运行主流程
main "$@"
