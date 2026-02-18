# 过期脚本清理报告

## 清理时间
2026-02-16

## 清理原因
2026-02-16事件中，用户发现使用关键词匹配的脚本生成了假数据：
- metrics都是5的倍数
- 推荐菜是硬编码的通用词（如"牛肉"、"鱼"）
- 口碑分数是估算的

用户明确要求：所有数据提取必须使用LLM，严禁关键词匹配。

## 已删除脚本（关键词匹配类）

### 餐厅提取类
- ~~extract_known_restaurants.py~~ ❌ 已删除
- ~~rebuild_from_raw.js~~ ❌ 已删除
- ~~rebuild_with_comments.js~~ ❌ 已删除
- ~~extract_restaurants_from_posts.js~~ ❌ 已删除
- ~~extract_restaurants_v2.py~~ ❌ 已删除
- ~~extract_restaurants_v3.py~~ ❌ 已删除
- ~~extract_restaurants_smart.py~~ ❌ 已删除
- ~~extract_comprehensive.py~~ ❌ 已删除

### 推荐菜提取类
- ~~extract_dishes_batch.py~~ ❌ 已删除
- ~~extract_dishes_v2.py~~ ❌ 已删除

### 假数据生成类
- ~~fix_data_fields.js~~ ❌ 已删除

## 已删除脚本（过期收集类）

### Pipeline阶段脚本
- ~~phase1_extract_content.js~~ ❌ 已删除
- ~~phase1b_process.py~~ ❌ 已删除
- ~~phase2to5_pipeline.py~~ ❌ 已删除
- ~~phase2_update_timeseries.js~~ ❌ 已删除
- ~~phase4_generate_trends.js~~ ❌ 已删除
- ~~phase5_merge_database.py~~ ❌ 已删除
- ~~phase6_search_mapping.js~~ ❌ 已删除

### 批量收集脚本
- ~~batch_collect.sh~~ ❌ 已删除
- ~~batch_collect_fixed.sh~~ ❌ 已删除
- ~~collect_all_posts.py~~ ❌ 已删除
- ~~collect_all_posts_fast.py~~ ❌ 已删除
- ~~collect_remaining.py~~ ❌ 已删除
- ~~collect_remaining_v2.sh~~ ❌ 已删除
- ~~collect_remaining_v3.sh~~ ❌ 已删除
- ~~collect_remaining_v4.sh~~ ❌ 已删除
- ~~fetch_scheduler.py~~ ❌ 已删除

## 已删除脚本（Unified Pipeline合并）⭐ 新增

### LLM提取脚本（已合并到AI直接处理）
- ~~kimi_llm_extract_v2.py~~ ❌ 已删除（功能并入Unified AI Pipeline）
- ~~batch_extract_dishes_llm.py~~ ❌ 已删除（功能并入Unified AI Pipeline）
- ~~generate_semantic_tags_llm.py~~ ❌ 已删除（功能并入Unified AI Pipeline）
- ~~generate_semantic_tags_simple.js~~ ❌ 已删除（简化版，已废弃）

## 已删除Cron Job（过期/禁用）

- ~~AI商业情报日报~~ ❌ 已删除（已禁用且被合并）
- ~~苹果情报日报~~ ❌ 已删除（已禁用且被合并）
- ~~OpenClaw Daily Digest~~ ❌ 已删除（已禁用且被合并）

## 已更新Cron Job

### 小红书餐厅数据日常维护 ✅
- **已更新为v3.0 Unified AI Pipeline**
- 合并所有LLM提取步骤
- AI一次会话完成餐厅+推荐菜+Tags
- 加入动态搜索词轮换
- 4周覆盖20+城市×12+菜系

## 保留的Cron Job

1. ✅ **小红书餐厅数据日常维护**（v3.0 Unified AI Pipeline）⭐
2. ✅ **每日综合情报日报**（合并版）
3. ✅ **每日Memory提炼**
4. ✅ **每周Memory归档**
5. ✅ **Weekly LLM Tech Digest**
6. ✅ **Southwest Flight Booking Reminder**（一次性）

## 当前有效脚本

### Unified AI Pipeline（新）⭐
- `docs/UNIFIED_AI_PIPELINE.md` - 统一AI Pipeline文档
- `scripts/unified_ai_extraction.js` - AI提取框架

### 轮换机制脚本
- `search_rotation.py` - 动态搜索词轮换

### 数据计算脚本
- `calculate_real_metrics.js` - metrics真实计算
- `verify_google_places_real.js` - Google验证
- `update-search-mapping.js` - 语义搜索映射更新

### QA脚本
- `qa/global-qa.js` - 全局QA验证

## 文档清单

- `docs/UNIFIED_AI_PIPELINE.md` - **统一AI Pipeline规范（最新）** ⭐
- `docs/LLM_PIPELINE_GUIDE.md` - LLM提取规范
- `PIPELINE.md` - 主Pipeline文档（含Cron Job配置）
- `docs/DATA_INTEGRITY_LESSON.md` - 2026-02-16事件记录
- `docs/SEARCH_ROTATION.md` - 搜索轮换机制
- `scripts/deprecated/README.md` - 已删除脚本记录
- `CLEANUP_REPORT.md` - 本文件

## 使用规范

1. **绝对不要**恢复或使用已删除的脚本
2. **必须使用** Unified AI Pipeline 进行数据提取
3. **AI直接处理** - 无需调用外部CLI
4. **验证**每次更新后的数据完整性
5. **遵守** UNIFIED_AI_PIPELINE.md 中的规范

## 未来更新流程（Unified AI）⭐

当新增Xiaohongshu帖子时：
1. Cron Job自动执行轮换搜索策略
2. **AI统一提取**（一次会话完成餐厅+推荐菜+Tags）⭐
3. 计算metrics (`calculate_real_metrics.js`)
4. Google验证 + QA + 部署
5. **严禁**回退到关键词匹配或多脚本方式
