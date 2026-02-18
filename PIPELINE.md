# Bay Area Food Map - Data Processing Pipeline

> ⚠️ **重要**: 所有数据提取必须使用LLM，严禁关键词匹配！详见 `docs/LLM_PIPELINE_GUIDE.md`

## Pipeline Overview

When raw data (Xiaohongshu posts) is updated, run this complete pipeline:

---

## Phase 1: Raw Data Extraction (LLM-Based)

**Input**: `/data/raw/v2/posts/*.json` (82 posts)
**Script**: `scripts/extract_restaurants.py` (or future LLM extraction)
**Output**: `restaurant_database_llm.json`

### Checklist
- [ ] Read all post files from `data/raw/v2/posts/`
- [ ] Parse MCP format (note + comments)
- [ ] Extract restaurant names using LLM or pattern matching
- [ ] Calculate engagement: likedCount + commentCount + collectedCount
- [ ] Extract metadata: cuisine, area, recommendations, context
- [ ] Save raw extraction results

### Quality Gates
- [ ] Verify all 82 posts processed
- [ ] Check for extraction errors (expect ~4 files with parse issues)
- [ ] Validate engagement calculations

---

## Phase 2: Data Cleaning & Processing

**Input**: `restaurant_database_llm.json`
**Script**: `scripts/process_restaurants.py`
**Output**: `restaurant_database_clean.json`

### Checklist
- [ ] **Name Normalization**: Merge variants (e.g., "留湘" → "留湘小聚")
- [ ] **Duplicate Merging**: Combine same restaurants across multiple posts
- [ ] **Cuisine Standardization**: Map to standard cuisine types
- [ ] **Area Standardization**: Normalize location names
- [ ] **Recommendation Extraction (LLM)**: Extract dishes using LLM, NOT keywords
  - Use `scripts/batch_extract_dishes_llm.py`
  - LLM analyzes post text for "推荐XXX", "必点XXX", "招牌XXX"
  - Returns specific dish names (not generic keywords like "牛肉", "鱼")
- [ ] **Validation Check**: Ensure required fields present
- [ ] **Filtering**: Remove blocked/suspicious entries

### Blocked Names (Auto-filter)
- Pure location names: "Cupertino", "Sunnyvale", "Fremont"
- Street names: "El Camino Real", "Stevens Creek Blvd"
- Generic terms: "美食", "餐厅", "饭店", "半岛"
- Description-only: "面面俱到" (context-dependent)

### Quality Gates
- [ ] All restaurants have valid names (>2 chars)
- [ ] All have engagement > 0
- [ ] All have at least 1 source post ID
- [ ] Duplicates merged correctly

---

## Phase 3: Search Mapping Generation

**Input**: `restaurant_database_clean.json`
**Script**: Inline Node.js or Python
**Output**: `search_mapping.json`

### Checklist
- [ ] Map cuisines to semantic scenes
- [ ] Generate keyword-to-restaurant mappings
- [ ] Create scene-based filters (family-dining, date-night, etc.)
- [ ] Ensure all restaurants appear in at least 1 scene

### Scene Mappings (Cuisine → Scenes)
```
火锅 → group-dining, celebration, comfort-food
烧烤 → group-dining, late-night, foodie-adventure
日料 → date-night, business-meal, foodie-adventure
川菜/湘菜 → group-dining, comfort-food, foodie-adventure
粤菜 → family-dining, business-meal, celebration
面食/饺子 → quick-bite, solo-dining, lunch-spot
```

---

## Phase 4: QA Validation

**Input**: `restaurant_database_clean.json`
**Script**: `qa/final-qa.js` or inline validation

### Checklist
- [ ] **Count Validation**: Expected ~70-80 restaurants after cleaning
- [ ] **Field Completeness**: All have name, engagement, sources
- [ ] **Data Integrity**: No null/undefined critical fields
- [ ] **Consistency**: Cuisine and area values standardized
- [ ] **Source Verification**: Each restaurant links to valid post files

### QA Metrics to Record
- Total restaurants
- Missing area count
- Missing cuisine count
- Top 10 by engagement (spot-check names)
- Distribution by area
- Distribution by cuisine

---

## Phase 5: Deployment

**Input**: `restaurant_database_clean.json`
**Output**: Multiple copies for different uses

### Checklist
- [ ] Copy to `restaurant_database.json` (main DB)
- [ ] Copy to `restaurant_database_v5_ui.json` (UI version)
- [ ] Verify `search_mapping.json` exists
- [ ] Clear browser cache recommendation (add `?reset`)
- [ ] Test UI loads correctly
- [ ] Verify filter counts match expected

---

## Quick Reference: Full Pipeline Command

```bash
cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# Step 1: Extract (if needed)
python3 scripts/extract_restaurants.py

# Step 2: Process
cp data/current/restaurant_database_llm.json data/current/restaurant_database_v8.json
python3 scripts/process_restaurants.py

# Step 3: Generate mappings (Node.js)
node -e "/* search mapping generation */"

# Step 4: QA
node -e "/* QA validation */"

# Step 5: Deploy
cp data/current/restaurant_database_clean.json data/current/restaurant_database.json
cp data/current/restaurant_database_clean.json data/current/restaurant_database_v5_ui.json

echo "Pipeline complete! Access http://localhost:8888/?reset"
```

---

## Expected Outputs

| Metric | Expected Range |
|--------|---------------|
| Raw Extraction | 80-90 restaurants |
| After Deduplication | 70-80 restaurants |
| With Complete Metadata | 40-50 restaurants |
| Final (with some missing area) | 70-80 restaurants |

---

## Common Issues & Fixes

### Issue: Emoji encoding errors
**Fix**: Use `utf-8` encoding with surrogate pass, or strip emojis before JSON dump

### Issue: Duplicate restaurant names
**Fix**: Maintain normalization mapping (e.g., "小聚" → "留湘小聚")

### Issue: Missing area/cuisine
**Fix**: Accept as "Unknown" for now, or manually review top restaurants

### Issue: LLM extraction fails
**Fix**: 
- ❌ 不要回退到关键词匹配
- ✅ 记录失败的posts，等待LLM服务恢复
- ✅ 只更新成功的部分，保证数据质量

---

## Version History

- v8.1-clean: Current pipeline with LLM extraction → 76 restaurants
- v6.1-with-comments: Previous keyword-based → 15 restaurants

---

## Next Run Checklist (Copy for new session)

When raw data updates:
1. [ ] Run LLM extraction on all posts
2. [ ] Run processing pipeline
3. [ ] Generate search mappings
4. [ ] Run QA validation
5. [ ] Deploy to UI files
6. [ ] Report results to user

**Estimated Time**: 5-10 minutes for full pipeline

---

## Cron Job / 自动化更新

> ⚠️ **Cron Job必须使用LLM提取，严禁关键词匹配！**

### 增量更新流程

当Xiaohongshu有新帖子时：

```bash
#!/bin/bash
# cron-update.sh - 定时增量更新脚本

set -e

echo "=== 开始增量数据更新 ==="

# 1. 增量提取新餐厅 (必须使用LLM)
echo "Step 1: LLM提取餐厅名..."
python3 scripts/kimi_llm_extract_v2.py --incremental

# 2. LLM提取推荐菜 (必须使用LLM)
echo "Step 2: LLM提取推荐菜..."
python3 scripts/batch_extract_dishes_llm.py

# 3. 计算metrics (情感分析+时间序列)
echo "Step 3: 计算metrics..."
node scripts/calculate_real_metrics.js

# 4. Google Places验证
echo "Step 4: Google Places验证..."
python3 scripts/verify_google_places_real.js

# 5. QA验证
echo "Step 5: QA验证..."
node qa/global-qa.js

# 6. 部署
echo "Step 6: 部署..."
cp data/current/restaurant_database.json data/current/restaurant_database_v5_ui.json

echo "=== 更新完成 ==="
```

### Cron配置示例

```json
{
  "name": "bay-area-food-map-incremental-update",
  "schedule": {
    "kind": "cron",
    "expr": "0 2 * * *",
    "tz": "America/Los_Angeles"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "执行Bay Area Food Map增量更新。强制要求：1) 餐厅名用LLM提取 2) 推荐菜用LLM提取 3) 严禁任何关键词匹配方法 4) 验证recommendations_source='llm_extracted'",
    "model": "kimi-coding/k2p5",
    "timeoutSeconds": 1800
  },
  "sessionTarget": "isolated",
  "notify": true
}
```

### 关键检查点

Cron job执行后必须验证：
- [ ] 新增餐厅有 `sources` 链接到post文件
- [ ] 推荐菜不是通用词（如"牛肉"、"鱼"）
- [ ] `recommendations_source` = 'llm_extracted'
- [ ] metrics不是5的倍数
- [ ] 所有餐厅有 `verified` 标记

### 失败处理

如果LLM提取失败：
1. **不要**回退到关键词匹配
2. 记录失败的posts
3. 等待人工处理或LLM服务恢复
4. 只更新成功的部分

### 相关文档

- `docs/LLM_PIPELINE_GUIDE.md` - LLM提取完整规范
- `docs/DATA_INTEGRITY_LESSON.md` - 历史教训
- `scripts/kimi_llm_extract_v2.py` - 餐厅名LLM提取
- `scripts/batch_extract_dishes_llm.py` - 推荐菜LLM提取
