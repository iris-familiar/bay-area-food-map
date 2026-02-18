# Pipeline更新总结 - 2026-02-16

## 已更新的文档

### 1. PIPELINE.md (主Pipeline文档)
**位置**: `/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/PIPELINE.md`

**更新内容**:
- 添加重要警告: "所有数据提取必须使用LLM，严禁关键词匹配"
- 更新Phase 2: 明确标注推荐菜必须使用LLM提取
- 新增"Cron Job / 自动化更新"章节
- 包含增量更新脚本模板
- Cron配置JSON示例
- 关键检查点和失败处理规范

### 2. docs/LLM_PIPELINE_GUIDE.md (新增)
**位置**: `/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/docs/LLM_PIPELINE_GUIDE.md`

**内容**:
- 明确警告: 哪些字段必须用LLM，哪些禁止用关键词匹配
- Phase 1: 餐厅名提取 - 强制LLM脚本和代码示例
- Phase 2: 推荐菜提取 - 强制LLM脚本和代码示例
- Phase 3: Metrics计算 - 允许非LLM方法（情感词典、数学计算）
- Cron Job更新流程 - 增量更新步骤
- 数据验证清单 - 每次更新后必须检查
- 历史教训 - 2026-02-16事件记录

### 3. docs/DATA_EXTRACTION_STRATEGY.md
**位置**: `/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/docs/DATA_EXTRACTION_STRATEGY.md`

**更新内容**:
- 推荐菜提取状态: "⏳ 正在进行" → "✅ 已完成"
- 添加完成情况: 75/76家餐厅成功提取
- 添加相关文档链接

### 4. docs/DATA_INTEGRITY_LESSON.md (已有)
**位置**: `/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/docs/DATA_INTEGRITY_LESSON.md`

**内容**: 记录2026-02-16事件教训

---

## Cron Job规范

### 必须遵守的规则

1. **餐厅名提取**: 必须使用 `scripts/kimi_llm_extract_v2.py`
2. **推荐菜提取**: 必须使用 `scripts/batch_extract_dishes_llm.py`
3. **严禁**: 任何关键词匹配方法
4. **验证**: 检查 `recommendations_source` = 'llm_extracted'

### Cron Job配置

```json
{
  "name": "bay-area-food-map-incremental-update",
  "schedule": {"kind": "cron", "expr": "0 2 * * *"},
  "payload": {
    "kind": "agentTurn",
    "message": "执行Bay Area Food Map增量更新。强制要求：1) 餐厅名用LLM提取 2) 推荐菜用LLM提取 3) 严禁任何关键词匹配"
  }
}
```

### 增量更新脚本

位置: `PIPELINE.md` 中 "Cron Job / 自动化更新" 章节

---

## 关键检查点

每次Cron Job执行后验证:
- [ ] 新增餐厅有 `sources` 链接
- [ ] 推荐菜不是通用词（如"牛肉"、"鱼"）
- [ ] `recommendations_source` = 'llm_extracted'
- [ ] metrics不是5的倍数
- [ ] 所有餐厅有 `verified` 标记

---

## 完成情况

| 任务 | 状态 |
|------|------|
| 76家餐厅LLM提取 | ✅ 完成 |
| Pipeline文档更新 | ✅ 完成 |
| Cron Job规范 | ✅ 完成 |
| 历史教训记录 | ✅ 完成 |
