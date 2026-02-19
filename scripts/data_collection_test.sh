#!/bin/bash
# =============================================================================
# Data Collection Test - 添加新数据并验证端到端流程
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

# 日志函数
log() { echo "[$(date '+%H:%M:%S')] $1"; }

log "=== 数据收集测试开始 ==="
log "时间: $RUN_TIMESTAMP"

# Step 1: 记录原始状态
log "Step 1: 记录原始状态"
BEFORE_COUNT=$(node -e "console.log(require('$DATA_DIR/current/restaurant_database.json').restaurants.length)")
log "  原始餐厅数: $BEFORE_COUNT"

# Step 2: 创建备份
log "Step 2: 创建自动备份"
BACKUP_PATH="${BACKUP_DIR}/collection_test_${RUN_TIMESTAMP}"
mkdir -p "$BACKUP_PATH"
cp "$DATA_DIR/current/restaurant_database.json" "$BACKUP_PATH/"
cp "$DATA_DIR/serving/serving_data.json" "$BACKUP_PATH/" 2>/dev/null || true

# 创建恢复脚本
cat > "$BACKUP_PATH/restore.sh" << EOF
#!/bin/bash
cd "$PROJECT_DIR"
cp "$BACKUP_PATH/restaurant_database.json" data/current/
cp "$BACKUP_PATH/serving_data.json" data/serving/ 2>/dev/null || true
echo "✅ 数据已恢复"
EOF
chmod +x "$BACKUP_PATH/restore.sh"
log "  ✅ 备份创建: $BACKUP_PATH"

# Step 3: 模拟爬取新数据
log "Step 3: 模拟爬取新数据"
RAW_DIR="${DATA_DIR}/raw/${RUN_DATE}"
mkdir -p "$RAW_DIR"

# 复制当前数据并添加新餐厅
node <> NODEOF
const fs = require('fs');

// 读取当前数据
const currentData = JSON.parse(fs.readFileSync('${DATA_DIR}/current/restaurant_database.json', 'utf8'));

// 创建新餐厅 (模拟爬取到的新数据)
const newRestaurant = {
    id: 'new_' + Date.now(),
    name: '🆕 新测试餐厅 ' + new Date().toLocaleDateString('zh-CN'),
    cuisine: '测试菜系',
    city: 'San Jose',
    region: 'South Bay',
    address: '123 Test St, San Jose, CA',
    engagement: Math.floor(Math.random() * 5000) + 1000,
    sentiment_score: 0.85,
    google_rating: 4.5,
    recommendations: ['测试菜品1', '测试菜品2'],
    post_details: [{
        note_id: 'test_' + Date.now(),
        title: '新餐厅测试数据',
        engagement: 1500,
        published_at: new Date().toISOString()
    }],
    updated_at: new Date().toISOString()
};

// 添加到数据集
currentData.restaurants.push(newRestaurant);
currentData.total_count = currentData.restaurants.length;
currentData.metadata = currentData.metadata || {};
currentData.metadata.last_collection = new Date().toISOString();
currentData.metadata.test_id = '${RUN_TIMESTAMP}';

// 保存为新数据
fs.writeFileSync('${RAW_DIR}/new_restaurants.json', JSON.stringify(currentData, null, 2));

console.log('✅ 新数据已创建:', newRestaurant.name);
console.log('✅ 新餐厅数:', currentData.restaurants.length);
NODEOF

NEW_COUNT=$(node -e "console.log(require('${RAW_DIR}/new_restaurants.json').restaurants.length)")
log "  ✅ 新数据餐厅数: $NEW_COUNT"

# Step 4: 数据预处理 (Bronze)
log "Step 4: 数据预处理 → Bronze"
BRONZE_DIR="${DATA_DIR}/bronze/${RUN_DATE}"
mkdir -p "$BRONZE_DIR"
cp "${RAW_DIR}/new_restaurants.json" "${BRONZE_DIR}/cleaned.json"
log "  ✅ Bronze层创建"

# Step 5: 数据标准化 (Silver)
log "Step 5: 数据标准化 → Silver"
SILVER_DIR="${DATA_DIR}/silver/${RUN_DATE}"
mkdir -p "$SILVER_DIR"
cp "${BRONZE_DIR}/cleaned.json" "${SILVER_DIR}/standardized.json"
log "  ✅ Silver层创建"

# Step 6: 合并到Gold (关键步骤)
log "Step 6: 合并到Gold层 (关键)"

# 使用Node.js合并数据
node <> NODEOF
const fs = require('fs');

const currentData = JSON.parse(fs.readFileSync('${DATA_DIR}/current/restaurant_database.json', 'utf8'));
const newData = JSON.parse(fs.readFileSync('${SILVER_DIR}/standardized.json', 'utf8'));

// 找出新添加的餐厅
const existingIds = new Set(currentData.restaurants.map(r => r.id));
const newRestaurants = newData.restaurants.filter(r => !existingIds.has(r.id));

if (newRestaurants.length === 0) {
    console.log('⚠️  没有新餐厅需要添加');
} else {
    console.log('✅ 发现', newRestaurants.length, '家新餐厅');
    
    // 添加新餐厅
    newRestaurants.forEach(r => {
        currentData.restaurants.push(r);
        console.log('  +', r.name);
    });
    
    currentData.total_count = currentData.restaurants.length;
    currentData.metadata = currentData.metadata || {};
    currentData.metadata.last_merge = new Date().toISOString();
    
    console.log('✅ 合并后餐厅数:', currentData.restaurants.length);
}

// 保存到Gold层
fs.writeFileSync('${DATA_DIR}/gold/restaurant_database.json', JSON.stringify(currentData, null, 2));

// 同时更新current层
fs.writeFileSync('${DATA_DIR}/current/restaurant_database.json', JSON.stringify(currentData, null, 2));

console.log('✅ Gold层和Current层已更新');
NODEOF

AFTER_MERGE=$(node -e "console.log(require('${DATA_DIR}/current/restaurant_database.json').restaurants.length)")
log "  ✅ 合并后餐厅数: $AFTER_MERGE"

# Step 7: 生成Serving层
log "Step 7: 生成Serving层"
node <> NODEOF
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('${DATA_DIR}/current/restaurant_database.json', 'utf8'));

// 生成服务数据 (简化版)
const servingData = {
    restaurants: data.restaurants,
    total_count: data.restaurants.length,
    metadata: {
        version: '1.0',
        updated_at: new Date().toISOString(),
        source: 'gold_layer'
    }
};

// 生成搜索索引
const searchIndex = {
    by_cuisine: {},
    by_city: {},
    by_region: {}
};

data.restaurants.forEach(r => {
    // 按菜系索引
    if (!searchIndex.by_cuisine[r.cuisine]) {
        searchIndex.by_cuisine[r.cuisine] = [];
    }
    searchIndex.by_cuisine[r.cuisine].push(r.id);
    
    // 按城市索引
    if (!searchIndex.by_city[r.city]) {
        searchIndex.by_city[r.city] = [];
    }
    searchIndex.by_city[r.city].push(r.id);
    
    // 按区域索引
    if (!searchIndex.by_region[r.region]) {
        searchIndex.by_region[r.region] = [];
    }
    searchIndex.by_region[r.region].push(r.id);
});

// 保存服务数据
fs.writeFileSync('${DATA_DIR}/serving/serving_data.json', JSON.stringify(servingData, null, 2));
fs.writeFileSync('${DATA_DIR}/serving/search_index.json', JSON.stringify(searchIndex, null, 2));

console.log('✅ Serving层已生成');
console.log('  - serving_data.json:', servingData.total_count, '家餐厅');
console.log('  - search_index.json:', Object.keys(searchIndex.by_cuisine).length, '种菜系');
NODEOF

SERVING_COUNT=$(node -e "console.log(require('${DATA_DIR}/serving/serving_data.json').total_count)")
log "  ✅ Serving层餐厅数: $SERVING_COUNT"

# Step 8: 验证数据一致性
log "Step 8: 验证数据一致性"
CURRENT_CHECK=$(node -e "console.log(require('${DATA_DIR}/current/restaurant_database.json').restaurants.length)")
SERVING_CHECK=$(node -e "console.log(require('${DATA_DIR}/serving/serving_data.json').total_count)")

log "  Current层: $CURRENT_CHECK 家"
log "  Serving层: $SERVING_CHECK 家"

if [ "$CURRENT_CHECK" -eq "$SERVING_CHECK" ]; then
    log "  ✅ 数据一致性检查通过"
else
    log "  ❌ 数据不一致!"
    exit 1
fi

# Step 9: 记录元数据
log "Step 9: 记录元数据"
mkdir -p "${DATA_DIR}/_meta"
cat > "${DATA_DIR}/_meta/last_collection.json" <> EOF
{
    "timestamp": "$RUN_TIMESTAMP",
    "date": "$RUN_DATE",
    "before_count": $BEFORE_COUNT,
    "after_count": $AFTER_MERGE,
    "added": $((AFTER_MERGE - BEFORE_COUNT)),
    "backup_path": "$BACKUP_PATH"
}
EOF

# 最终报告
log ""
log "╔════════════════════════════════════════════════════════════╗"
log "║     ✅ 数据收集测试完成                                    ║"
log "╚════════════════════════════════════════════════════════════╝"
log ""
log "📊 数据统计:"
log "  原始餐厅数: $BEFORE_COUNT"
log "  新增餐厅数: $((AFTER_MERGE - BEFORE_COUNT))"
log "  最终餐厅数: $AFTER_MERGE"
log ""
log "📁 数据位置:"
log "  Raw:     ${RAW_DIR}/"
log "  Bronze:  ${BRONZE_DIR}/"
log "  Silver:  ${SILVER_DIR}/"
log "  Gold:    ${DATA_DIR}/gold/"
log "  Serving: ${DATA_DIR}/serving/"
log ""
log "💾 备份位置:"
log "  $BACKUP_PATH"
log "  恢复命令: bash $BACKUP_PATH/restore.sh"
log ""

# 验证新餐厅是否存在
NEW_RESTAURANT_NAME=$(node -e "const d=require('${DATA_DIR}/current/restaurant_database.json'); const r=d.restaurants.find(x=>x.id.startsWith('new_')); console.log(r?r.name:'未找到')")
log "🆕 新添加的餐厅: $NEW_RESTAURANT_NAME"
log ""

exit 0
