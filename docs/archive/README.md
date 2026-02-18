# 归档文档说明

## 警告

此目录包含**已过时的文档**，仅用于历史参考。

## 归档原因

这些文档包含：
- 旧版本的数据模型 (v5, v2等)
- 过时的Pipeline流程
- 已废弃的方法说明
- 历史报告和计划

## 当前有效文档

请参考上级目录中的最新文档：

- `LLM_PIPELINE_GUIDE.md` - **最新Pipeline规范**
- `DATA_EXTRACTION_STRATEGY.md` - 数据提取策略
- `DATA_INTEGRITY_LESSON.md` - 2026-02-16事件记录
- `DATA_REBUILD_REPORT.md` - 数据重建报告
- `SEARCH_ROTATION.md` - 搜索轮换机制

## 关键变更

### 2026-02-16 重大更新
- ❌ 废弃：关键词匹配提取
- ✅ 强制：LLM提取所有数据
- ❌ 废弃：硬编码推荐菜
- ✅ 强制：真实计算metrics
- ❌ 废弃：猜测/编造假数据
- ✅ 强制：所有数据必须可溯源

## 使用建议

**不要参考此目录中的文档进行开发！**

如需了解最新流程，请阅读：
- `/docs/LLM_PIPELINE_GUIDE.md`
- `/PIPELINE.md`
- `/CLEANUP_REPORT.md`

---
**归档时间**: 2026-02-16
