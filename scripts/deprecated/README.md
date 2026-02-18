# ⚠️ 过期脚本目录

## 警告

此目录原本包含**已过期的脚本**，这些脚本使用了**关键词匹配**方法提取数据。

## 状态

**2026-02-16: 所有过期脚本已永久删除**

## 已删除的脚本

以下脚本已被永久删除：

### 餐厅提取类（关键词匹配）
- ~~extract_known_restaurants.py~~ ❌ 已删除
- ~~rebuild_from_raw.js~~ ❌ 已删除
- ~~rebuild_with_comments.js~~ ❌ 已删除
- ~~extract_restaurants_from_posts.js~~ ❌ 已删除
- ~~extract_restaurants_v2.py~~ ❌ 已删除
- ~~extract_restaurants_v3.py~~ ❌ 已删除
- ~~extract_restaurants_smart.py~~ ❌ 已删除
- ~~extract_comprehensive.py~~ ❌ 已删除

### 推荐菜提取类（关键词匹配）
- ~~extract_dishes_batch.py~~ ❌ 已删除
- ~~extract_dishes_v2.py~~ ❌ 已删除

### 假数据生成类
- ~~fix_data_fields.js~~ ❌ 已删除

## 删除原因

在 2026-02-16 事件中，用户发现这些脚本生成的数据不真实：
- 口碑分数是估算的（非真实计算）
- 推荐菜是硬编码的（非真实提取）
- 趋势是猜测的（非真实计算）

## 用户明确要求

> "我在这个app上我不需要任何数据或者metrics是你猜出来的"

> "每一步都要自己算 不要猜测 推断 make up any metrics"

## 替代方案

请使用最新的LLM提取脚本：

| 任务 | 最新脚本 |
|------|---------|
| 餐厅名提取 | `scripts/kimi_llm_extract_v2.py` |
| 推荐菜提取 | `scripts/batch_extract_dishes_llm.py` |
| 数据库重建 | 使用完整Pipeline (`PIPELINE.md`) |
| metrics计算 | `scripts/calculate_real_metrics.js` |

## 最新Pipeline文档

- `docs/LLM_PIPELINE_GUIDE.md` - LLM提取完整规范
- `PIPELINE.md` - 主Pipeline文档
- `docs/DATA_INTEGRITY_LESSON.md` - 2026-02-16事件记录

---
**删除时间**: 2026-02-16
**删除人**: Travis (AI Agent)
**原因**: 避免未来误用，确保数据完整性
