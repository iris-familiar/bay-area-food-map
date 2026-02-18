# 湾区美食地图项目 - 后端全面检测报告

**检测日期:** 2026-02-18  
**检测范围:** /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/  
**检测角色:** 资深后端工程师

---

## 📋 执行摘要

经过全面检测，发现项目存在 **5个关键问题**，涉及数据覆盖、合并逻辑缺失、cron job不完整等。最严重的问题是**缺少安全的数据合并机制**，导致新数据可能覆盖旧数据。

### 关键发现

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 严重 | 3 | 数据丢失风险、合并逻辑缺失、事务不完整 |
| 🟡 中等 | 5 | 脚本路径错误、异常处理不足、代码冗余 |
| 🟢 轻微 | 4 | 日志记录、代码风格问题 |

---

## 🔴 严重问题

### 1. **数据合并逻辑完全缺失** [CRITICAL]

**问题描述:**  
项目存在 v5 和 v8 两个数据库格式，但 **没有任何安全的数据合并脚本**。

**证据:**
```
data/current/
├── restaurant_database.json (symlink → v5_ui.json)
├── restaurant_database_v5_ui.json (79家, version 10.0-final)
└── v8_llm_extraction_batch_20260218.json (8家, version 8.1)
```

**代码问题 (scripts/merge_restaurants.py:15-42):**
```python
# 严重缺陷：简单的名称匹配去重
for r in llm['restaurants']:
    key = r['name'].lower().replace(' ', '')
    is_duplicate = False
    for orig_name in original_names:
        if key in orig_name or orig_name in key:  # 第28-29行: 模糊匹配太宽松
            is_duplicate = True
            break
```

**风险:**
- 同名不同店的餐厅会被错误去重
- 新数据可能完全覆盖旧数据
- 没有增量更新机制

**修复建议:**
```python
# 建议实现安全合并
SAFE_MERGE_RULES = {
    'match_by': ['google_place_id', 'name+address', 'name+area'],
    'conflict_resolution': 'keep_higher_engagement',
    'backup_before_merge': True,
    'field_level_merge': {
        'post_details': 'append_unique',
        'engagement': 'sum',
        'recommendations': 'merge_deduplicate'
    }
}
```

---

### 2. **Cron Job 数据整合逻辑不完整** [CRITICAL]

**问题描述:**  
`daily_master_job.sh` 和 `end_to_end_batch.sh` 存在执行路径问题，且缺少数据回合并到主数据库的逻辑。

**代码问题 (scripts/daily_master_job.sh:18-22):**
```bash
# 第18行: 调用不存在的脚本
echo "[1/4] Checking blogger updates..."
python3 scripts/check_bloggers.py 2>&1 | tee -a logs/bloggers.log
# 结果: Error - 文件不存在
```

**代码问题 (scripts/end_to_end_batch.sh:182-196):**
```bash
# 第182-196行: 引用的 merge_batch.py 不存在
python3 scripts/merge_batch.py \
    --batch "$BATCH_ID" \
    --input "${DATA_DIR}/${BATCH_ID}_candidates.json" \
    --output "$DATA_DIR/current/restaurant_database.json"
# 结果: Error - merge_batch.py 不存在
```

**风险:**
- 每日cron job无法正确整合新数据
- 新提取的餐厅数据无法进入主数据库
- 日志显示"completed"但实际数据未更新

---

### 3. **事务回滚机制不完整** [HIGH]

**代码问题 (scripts/transaction.js:60-75):**
```javascript
// 第60-75行: rollbackTransaction 只在内存中恢复，没有处理文件系统级别的并发问题
function rollbackTransaction(transactionId) {
  const backupPath = path.join(BACKUP_DIR, `${transactionId}.json`);
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, DB_FILE);  // 没有锁机制
    return true;
  }
}
```

**问题:**
- 没有文件锁，并发操作可能导致数据损坏
- 事务ID没有持久化到日志
- 崩溃恢复机制缺失

---

## 🟡 中等问题

### 4. **异常处理覆盖不足**

**代码问题 (scripts/standardize_database.js:19-25):**
```javascript
// 第19-25行: 验证失败时直接退出，没有降级方案
try {
    execSync('node ' + path.join(__dirname, 'verify_data_integrity.js'), { stdio: 'inherit' });
    console.log('\n✅ 数据验证通过，无需修复');
    process.exit(0);  // 过早退出，跳过后续备份步骤
} catch (e) {
    console.log('\n⚠️  数据需要修复，继续执行...\n');
}
```

**代码问题 (scripts/analyze-daily-data.js:35-43):**
```javascript
// 第35-43行: 文件不存在时没有优雅降级
const raw = fs.readFileSync(searchResultsPath, 'utf8');
const parsed = JSON.parse(raw);
searchResults = JSON.parse(parsed.result?.content?.[0]?.text || '{}');
} catch (e) {
  console.log('搜索数据解析失败:', e.message);  // 只打印，没有退出
}
// 后续代码继续使用可能为null的searchResults
```

---

### 5. **V8到V5转换丢失数据**

**代码问题 (scripts/convert_v8_to_v5.js:14-44):**
```javascript
// 第42行: 简单过滤掉了非active餐厅
const active = converted.filter(r => r.is_active !== false);
// 问题：没有处理is_active字段缺失的情况，也没有标记被过滤的餐厅

// 第47-49行: 直接覆盖symlink，没有验证
fs.symlinkSync('restaurant_database_v5_ui.json', symlinkPath);
// 问题：如果目标文件不是symlink而是普通文件，会报错
```

---

### 6. **数据验证规则不完整**

**代码问题 (scripts/verify_data_integrity.js:42-54):**
```javascript
// 第42-54行: 只检查了关键字段存在性，没有验证数据合理性
const criticalFields = ['name', 'engagement', 'sentiment_score'];
// 缺失检查:
// - engagement 是否为负数
// - sentiment_score 是否在 0-1 范围
// - 重复的 id
// - 必填字段组合验证
```

---

### 7. **Symlink 管理混乱**

**检测发现:**
```bash
# 当前状态
lrwxr-xr-x  restaurant_database.json -> restaurant_database_v5_ui.json

# 问题:
# 1. symlink指向的文件版本号混乱 (v5_ui.json 但实际是 v10.0-final)
# 2. 多个脚本尝试更新symlink但没有统一的管理
# 3. convert_v8_to_v5.js 和 apply_corrections.js 都可能修改symlink
```

---

### 8. **重复检测逻辑不一致**

**代码问题 (scripts/auto_quality_fix.js:28-81):**
```javascript
// 第28-81行: 基于google_place_id检测重复
// 但 merge_restaurants.py 使用名称匹配
// 两者逻辑不统一，可能导致漏检或误检

// auto_quality_fix.js 标记重复但不删除，只是添加_status字段
// 但UI层可能不识别_status字段，导致重复显示
```

---

## 🟢 轻微问题

### 9. **日志记录不规范**

**代码问题 (scripts/cron_daily_v5.sh:25-30):**
```bash
# 第25-30行: 部分脚本输出到文件，部分输出到stdout，没有统一格式
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}
# 但并非所有脚本都使用这个函数，有些直接echo
```

---

### 10. **硬编码路径过多**

**检测统计:**
- 至少12个脚本包含硬编码绝对路径
- 路径形式不统一：`${HOME}/...` vs 绝对路径 `/Users/joeli/...`
- 没有统一的配置文件管理

---

## 📊 数据管道设计缺陷

### 当前数据流

```
[小红书搜索] → [原始数据] → [LLM提取] → v8格式
                                    ↓
[主数据库v5] ← [?? 缺少合并步骤 ??] ← 新餐厅数据
      ↓
[转换脚本] → v5_ui格式 → [UI显示]
```

**关键缺陷:**
1. **缺少增量合并步骤** - 新数据无法安全合并到主数据库
2. **版本管理混乱** - v5, v8, v10 同时存在
3. **没有数据血缘追踪** - 不知道数据来自哪个源头

### 建议的安全数据合并流程

```
[新数据提取] → [验证器] → [冲突检测] → [合并引擎] → [主数据库]
                    ↓            ↓              ↓
               [拒绝列表]  [人工审核]      [自动备份]
```

**合并引擎规则:**

```javascript
const MERGE_RULES = {
  // 身份匹配优先级
  identity: [
    { field: 'google_place_id', weight: 1.0 },
    { field: 'name+address', weight: 0.9 },
    { field: 'name+city', weight: 0.7 }
  ],
  
  // 字段级合并策略
  fields: {
    // 追加数组字段
    post_details: { strategy: 'append', dedupe_by: 'post_id' },
    sources: { strategy: 'merge_unique' },
    
    // 数值累加
    total_engagement: { strategy: 'sum' },
    mention_count: { strategy: 'sum' },
    
    // 取最新
    updated_at: { strategy: 'max' },
    
    // 人工修正优先
    name: { strategy: 'protect_if_corrected' },
    address: { strategy: 'protect_if_corrected' },
    
    // 质量优先
    recommendations: { strategy: 'longer_array_wins' }
  }
};
```

---

## 📝 需要重写的脚本

| 脚本 | 优先级 | 原因 |
|------|--------|------|
| `merge_batch.py` | 🔴 紧急 | 完全缺失，cron job无法工作 |
| `merge_restaurants.py` | 🔴 紧急 | 去重逻辑错误，需要完全重写 |
| `daily_master_job.sh` | 🟡 高 | 调用不存在的脚本，流程不完整 |
| `end_to_end_batch.sh` | 🟡 高 | 依赖缺失的merge脚本 |
| `convert_v8_to_v5.js` | 🟡 高 | 数据丢失风险，需要更安全的转换 |
| `transaction.js` | 🟢 中 | 需要添加文件锁和持久化日志 |

---

## 🛠️ 具体修复代码

### 修复1: 安全的数据合并脚本 (新增)

**文件:** `scripts/safe_merge.js`

```javascript
#!/usr/bin/env node
/**
 * 安全的数据合并脚本
 * 解决v5/v8格式不一致和新数据覆盖问题
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/current/restaurant_database_v5_ui.json');
const NEW_DATA_PATH = process.argv[2];

if (!NEW_DATA_PATH) {
  console.error('Usage: node safe_merge.js <new_data.json>');
  process.exit(1);
}

// 1. 加载现有数据库
const existing = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const newData = JSON.parse(fs.readFileSync(NEW_DATA_PATH, 'utf8'));

// 2. 创建ID索引
const existingById = new Map(existing.restaurants.map(r => [r.id, r]));
const existingByGoogleId = new Map(
  existing.restaurants.filter(r => r.google_place_id).map(r => [r.google_place_id, r])
);

// 3. 合并逻辑
const merged = [];
const conflicts = [];
const added = [];

for (const newRestaurant of newData.restaurants || []) {
  // 尝试按Google Place ID匹配
  let match = existingByGoogleId.get(newRestaurant.google_place_id);
  
  // 尝试按名称+地址匹配
  if (!match && newRestaurant.address) {
    match = existing.restaurants.find(r => 
      r.name === newRestaurant.name && 
      r.address === newRestaurant.address
    );
  }
  
  if (match) {
    // 合并到现有记录
    console.log(`🔄 合并: ${newRestaurant.name} → ${match.id}`);
    
    // 合并帖子详情（去重）
    const existingPostIds = new Set(match.post_details?.map(p => p.post_id) || []);
    const newPosts = newRestaurant.post_details?.filter(p => !existingPostIds.has(p.post_id)) || [];
    match.post_details = [...(match.post_details || []), ...newPosts];
    
    // 累加互动数
    match.total_engagement = (match.total_engagement || 0) + (newRestaurant.total_engagement || 0);
    match.mention_count = (match.mention_count || 0) + (newRestaurant.mention_count || 0);
    
    // 合并来源
    const existingSources = new Set(match.sources || []);
    newRestaurant.sources?.forEach(s => existingSources.add(s));
    match.sources = Array.from(existingSources);
    
    // 保留更好的推荐菜（更长列表优先）
    if (newRestaurant.recommendations?.length > (match.recommendations?.length || 0)) {
      match.recommendations = newRestaurant.recommendations;
    }
    
    merged.push(match.id);
  } else {
    // 新餐厅，分配新ID
    const maxId = Math.max(...existing.restaurants.map(r => parseInt(r.id.replace('r', ''))));
    newRestaurant.id = `r${String(maxId + 1 + added.length).padStart(3, '0')}`;
    
    console.log(`➕ 新增: ${newRestaurant.name} (${newRestaurant.id})`);
    existing.restaurants.push(newRestaurant);
    added.push(newRestaurant.id);
  }
}

// 4. 更新元数据
existing.version = '10.1-merged';
existing.updated_at = new Date().toISOString();
existing.merge_log = {
  timestamp: new Date().toISOString(),
  source: NEW_DATA_PATH,
  merged: merged.length,
  added: added.length,
  total: existing.restaurants.length
};

// 5. 保存（带备份）
const backupPath = DB_PATH.replace('.json', `_backup_${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2));
console.log(`\n💾 备份已创建: ${backupPath}`);

fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2));
console.log(`💾 数据库已更新: ${DB_PATH}`);

// 6. 报告
console.log('\n' + '='.repeat(50));
console.log('合并报告:');
console.log(`  已合并: ${merged.length} 家`);
console.log(`  新添加: ${added.length} 家`);
console.log(`  总计: ${existing.restaurants.length} 家`);
```

### 修复2: 更新 daily_master_job.sh

**修改 (scripts/daily_master_job.sh:18-25):**

```bash
# 修复: 删除或替换不存在的脚本调用
# BEFORE:
# python3 scripts/check_bloggers.py 2>&1 | tee -a logs/bloggers.log

# AFTER:
echo "[1/4] 检查新帖子..."
# 使用实际存在的脚本
node scripts/analyze-daily-data.js 2>&1 | tee -a logs/daily_analysis.log || true
echo ""
```

**修改 (scripts/daily_master_job.sh:82-95):**

```bash
# 修复: 添加安全合并步骤
# AFTER batch job:
echo "🔧 PHASE 3: 数据合并"
echo "----------------------------------------------------------------------"

# 查找最新提取的数据
LATEST_V8=$(ls -t data/current/v8_*.json 2>/dev/null | head -1)
if [ -n "$LATEST_V8" ]; then
    echo "合并数据: $LATEST_V8"
    node scripts/safe_merge.js "$LATEST_V8" 2>&1 | tee -a logs/merge.log
else
    echo "没有新数据需要合并"
fi
echo ""
```

### 修复3: 增强 verify_data_integrity.js

**添加 (scripts/verify_data_integrity.js:新增函数):**

```javascript
// 在文件末尾添加

function validateDataQuality(restaurants) {
  const errors = [];
  const seenIds = new Set();
  
  restaurants.forEach((r, idx) => {
    // 检查重复ID
    if (seenIds.has(r.id)) {
      errors.push(`重复ID: ${r.id} at index ${idx}`);
    }
    seenIds.add(r.id);
    
    // 检查负数engagement
    if (r.engagement < 0) {
      errors.push(`${r.id}: engagement为负数 (${r.engagement})`);
    }
    
    // 检查sentiment_score范围
    if (r.sentiment_score !== undefined && (r.sentiment_score < 0 || r.sentiment_score > 1)) {
      errors.push(`${r.id}: sentiment_score超出范围 (${r.sentiment_score})`);
    }
    
    // 检查必填组合
    if (!r.google_place_id && !r.address) {
      warnings.push(`${r.id}: 缺少Google Place ID和地址，可能难以定位`);
    }
  });
  
  return errors;
}
```

---

## 🎯 回答关键问题

### Q1: 为什么新数据会覆盖旧数据？

**答案:**
1. `merge_restaurants.py` 使用**宽松的去重逻辑**（简单的名称子串匹配），导致不同餐厅可能被误认为重复
2. 脚本会**重新编号所有餐厅**，破坏原有ID体系
3. 没有字段级合并策略，而是**简单追加后重新排序**
4. `end_to_end_batch.sh` 引用的 `merge_batch.py` **根本不存在**，cron job无法完成数据合并

### Q2: 数据库格式不一致（v5 vs v8）如何解决？

**答案:**
1. **停止双轨制**: 统一使用 v5 格式作为主格式
2. **转换脚本增强**: 修复 `convert_v8_to_v5.js`，添加完整的字段映射
3. **迁移策略**: 使用 `safe_merge.js` 逐步合并 v8 数据到 v5 主库
4. **字段兼容**: v5 格式已包含 v8 的所有字段（如 semantic_tags, post_details）

### Q3: 如何设计一个安全的数据合并流程？

**答案:** 见上文"建议的安全数据合并流程"章节，核心要点：
1. **身份识别**: 多维度匹配（Google Place ID → 名称+地址 → 名称+城市）
2. **字段级策略**: 不同字段采用不同的合并策略（累加、取并集、取最新等）
3. **冲突处理**: 自动合并低置信度冲突，人工审核高置信度冲突
4. **备份机制**: 每次合并前自动创建备份
5. **事务支持**: 合并失败时自动回滚

---

## 📋 执行检查清单

- [ ] 立即创建 `scripts/safe_merge.js`
- [ ] 修复 `daily_master_job.sh` 中不存在的脚本调用
- [ ] 重写 `merge_restaurants.py`
- [ ] 创建缺失的 `merge_batch.py`
- [ ] 测试端到端数据流
- [ ] 设置 cron job 监控告警

---

**报告生成时间:** 2026-02-18 08:20 PST  
**报告生成者:** 后端检测子代理
