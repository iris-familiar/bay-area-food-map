# Semantic Search Maintenance Guide
# 语义搜索维护指南

## 📋 维护触发条件

当以下情况发生时，需要运行维护脚本：

1. **新增餐厅** - 新餐厅加入数据库
2. **餐厅信息更新** - semantic_tags、价格、口碑分数变化
3. **搜索效果不佳** - 用户反馈某些关键词搜索结果不准确
4. **定期回顾** - 建议每月运行一次检查

---

## 🛠️ 维护步骤

### Step 1: 运行更新脚本

```bash
cd projects/bay-area-food-map
node scripts/update-search-mapping.js
```

脚本会：
- 读取 `restaurant_database.json`
- 根据semantic_tags自动匹配场景
- 生成新的 `search_mapping.json`
- 输出映射统计和未匹配餐厅列表

### Step 2: 审核结果

检查脚本输出的统计信息：

```
📈 映射统计:
   约会 (8家): Shoji, Noren Izakaya, Tamarine Restaurant...
   聚餐 (14家): 顾湘, 留湘, 香锅大王...
   ...

⚠️  未匹配到任何场景的餐厅 (2家):
   - 某餐厅名 (某菜系)
   建议：检查这些餐厅的semantic_tags是否完整
```

**审核重点**：
- [ ] 口碑分数高的餐厅是否排在场景前面
- [ ] 新餐厅是否被正确分类
- [ ] 未匹配的餐厅是否需要补充semantic_tags

### Step 3: 手动调整（可选）

如果自动映射不满意，可以手动编辑 `data/search_mapping.yaml`：

```yaml
restaurant_mappings:
  date: ["r006", "r007", "r019", ...]  # 手动调整顺序
  group: ["r001", "r020", ...]
  # ...
```

调整原则：
- **顺序 = 推荐优先级**，口碑好的排前面
- 删除明显不匹配的餐厅ID
- 添加遗漏的餐厅ID

### Step 4: 重新生成JSON

如果手动编辑了YAML，需要重新生成JSON：

```bash
node scripts/update-search-mapping.js
```

### Step 5: 测试验证

打开 `index.html`，测试关键搜索词：

| 测试词 | 期望结果 |
|--------|----------|
| 约会 | Tamarine、Shoji等约会餐厅优先 |
| 聚餐 | 香锅大王、留湘等聚餐餐厅优先 |
| 便宜 | 王家味、顾湘等性价比餐厅优先 |
| 安静 | Tamarine、Shoji等安静环境优先 |

---

## 📝 添加新场景

如果需要支持新的搜索场景：

### 1. 编辑 search_mapping.yaml

```yaml
scenes:
  # 在 scenes 下添加新场景
  new_scene:
    name: "新场景名称"
    description: "场景描述"
    keywords: ["关键词1", "关键词2", "keyword1", "keyword2"]
```

### 2. 更新匹配规则

编辑 `scripts/update-search-mapping.js` 中的 `SCENE_RULES`：

```javascript
const SCENE_RULES = {
  // ... 现有规则
  
  new_scene: {
    scenes: ['对应semantic_tag'],
    vibes: ['对应vibe'],
    practical: ['对应practical'],
    minSentiment: 0.6  // 最低口碑分要求
  }
};
```

### 3. 运行脚本重新生成

```bash
node scripts/update-search-mapping.js
```

---

## 📊 数据文件说明

| 文件 | 用途 | 是否手工编辑 |
|------|------|-------------|
| `search_mapping.yaml` | 配置源文件（场景定义、关键词） | ✅ 可编辑 |
| `search_mapping.json` | 前端使用的映射数据 | ❌ 自动生成 |
| `restaurant_database.json` | 餐厅数据 | ❌ 由数据采集流程生成 |

---

## 🔧 故障排查

### 搜索某个词没有结果

1. 检查 `search_mapping.json` 中是否有该关键词
2. 检查对应场景是否有餐厅映射
3. 检查餐厅是否被 `filterAsianRestaurants` 过滤掉了

### 搜索结果排序不合理

1. 检查 `restaurant_mappings` 中的顺序
2. 检查餐厅口碑分数是否准确
3. 考虑手动调整YAML中的顺序

### 新餐厅搜不到

1. 确认新餐厅有完整的 `semantic_tags`
2. 运行 `update-search-mapping.js` 重新生成映射
3. 检查是否有未匹配的餐厅警告

---

## 🎯 最佳实践

1. **自动化优先**：尽量依赖脚本自动生成，减少手工维护
2. **定期回顾**：每月检查一次映射效果
3. **用户反馈**：收集用户搜索日志，发现缺失的关键词
4. **版本控制**：每次更新映射后提交git，便于回滚
5. **渐进优化**：不要追求一次性完美，根据实际使用持续优化

---

## 📝 变更记录

| 日期 | 变更内容 | 维护人 |
|------|----------|--------|
| 2026-02-16 | 初始映射，覆盖14个场景 | Travis |
| | | |
