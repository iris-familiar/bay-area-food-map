# Bay Area Food Map - 当前Data Pipeline (2026-02-16)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE 流程图                              │
└─────────────────────────────────────────────────────────────────────────┘

【阶段1】原始数据采集 (Xiaohongshu API)
├─ 输入: 小红书帖子API
├─ 输出: data/raw/v2/posts/*.json (82个post文件)
└─ 频率: 每周/按需采集

        ↓

【阶段2】餐厅名提取 (LLM - 强制)
├─ 脚本: scripts/kimi_llm_extract_v2.py
├─ 方法: Kimi LLM分析帖子文本
├─ 输出: 餐厅名、菜系、地区
├─ 严禁: ❌ 关键词匹配
└─ 验证: 每个餐厅必须链接到source post

        ↓

【阶段3】推荐菜提取 (LLM - 强制)
├─ 脚本: scripts/batch_extract_dishes_llm.py
├─ 方法: LLM识别"推荐XXX"、"必点XXX"、"惊艳"
├─ 输出: 具体菜品名 (如"傣味香茅草烤鱼")
├─ 严禁: ❌ 关键词匹配 (如"牛肉"、"鱼")
├─ 标记: recommendations_source = 'llm_extracted'
└─ 验证: 对比帖子原文确认推荐语境

        ↓

【阶段4】Metrics计算 (真实计算)
├─ 脚本: scripts/calculate_real_metrics.js
├─ 口碑: 情感词典统计 (正面/负面词) → 0-100分
├─ 趋势: 最近30天讨论度占比 → 0-100%
├─ 讨论度: likes + comments + collected
├─ 提及: 统计source posts数量
└─ 验证: 不是5的倍数 (真实计算的特征)

        ↓

【阶段5】Google验证 (API - 强制)
├─ 脚本: scripts/verify_google_places_real.js
├─ 输入: 餐厅名 + 地区
├─ API: Google Places API
├─ 输出: 
│   ├─ google_rating (真实评分)
│   ├─ google_place_id (唯一标识)
│   ├─ address (真实地址)
│   └─ verified: true
└─ 严禁: ❌ 猜测/编造假数据

        ↓

【阶段6】QA验证
├─ 脚本: qa/global-qa.js
├─ 检查点:
│   ├─ 所有餐厅有source post链接
│   ├─ 推荐菜不是通用词 (非"牛肉"/"鱼")
│   ├─ recommendations_source = 'llm_extracted'
│   ├─ metrics不是5的倍数
│   └─ google_rating有对应place_id
└─ 输出: QA报告

        ↓

【阶段7】部署
├─ 复制: restaurant_database.json
├─ 复制: restaurant_database_v5_ui.json (UI用)
├─ 生成: search_mapping.json (语义搜索)
└─ 刷新: 浏览器缓存 (?reset)

┌─────────────────────────────────────────────────────────────────────────┐
│                         CRON JOB 规范                                     │
└─────────────────────────────────────────────────────────────────────────┘

【定时任务配置】
{
  "name": "bay-area-food-map-incremental-update",
  "schedule": {
    "kind": "cron",
    "expr": "0 2 * * *",      // 每天凌晨2点
    "tz": "America/Los_Angeles"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "执行Bay Area Food Map增量更新。\n\n强制要求:\n1. 餐厅名用LLM提取 (kimi_llm_extract_v2.py)\n2. 推荐菜用LLM提取 (batch_extract_dishes_llm.py)\n3. 严禁任何关键词匹配方法\n4. 验证recommendations_source='llm_extracted'",
    "model": "kimi-coding/k2p5",
    "timeoutSeconds": 1800
  },
  "sessionTarget": "isolated",
  "notify": true
}

【Cron Job执行流程】

#!/bin/bash
# cron-update.sh

set -e

echo "=== Bay Area Food Map 增量更新 ==="

# 1. 增量提取新餐厅 (LLM - 强制)
echo "[1/6] LLM提取餐厅名..."
python3 scripts/kimi_llm_extract_v2.py --incremental

# 2. LLM提取推荐菜 (LLM - 强制)
echo "[2/6] LLM提取推荐菜..."
python3 scripts/batch_extract_dishes_llm.py

# 3. 计算metrics
echo "[3/6] 计算metrics..."
node scripts/calculate_real_metrics.js

# 4. Google验证
echo "[4/6] Google Places验证..."
node scripts/verify_google_places_real.js

# 5. QA验证
echo "[5/6] QA验证..."
node qa/global-qa.js

# 6. 部署
echo "[6/6] 部署..."
cp data/current/restaurant_database.json \
   data/current/restaurant_database_v5_ui.json

echo "=== 更新完成 ==="

【关键检查点】(Cron Job后必须验证)

□ 新增餐厅有sources数组 (链接到post文件)
□ 推荐菜包含具体菜品名 (非"牛肉"/"鱼"/"面")
□ recommendations_source = 'llm_extracted'
□ 口碑分数不是5的倍数 (真实计算的特征)
□ 趋势分数不是5的倍数
□ 所有餐厅verified = true
□ 有google_rating必有google_place_id

【失败处理】

如果LLM提取失败:
1. ❌ 严禁回退到关键词匹配
2. ✅ 记录失败的posts
3. ✅ 等待LLM服务恢复或人工处理
4. ✅ 只更新成功的部分

┌─────────────────────────────────────────────────────────────────────────┐
│                      数据字段来源对照表                                   │
└─────────────────────────────────────────────────────────────────────────┘

| 字段 | 来源 | 方法 | 验证 |
|------|------|------|------|
| name | Xiaohongshu帖子 | LLM提取 | 有source post |
| cuisine | Xiaohongshu帖子 | LLM提取 | 文本分析 |
| area | Google Places API | API返回 | verified=true |
| total_engagement | Xiaohongshu帖子 | likes+comments+collected | 计算验证 |
| mention_count | Xiaohongshu帖子 | 统计sources | 计数验证 |
| sentiment_score | 帖子文本 | 情感词典分析 | 0-100分 |
| trend_30d | 帖子时间 | 最近30天占比 | 0-100% |
| recommendations | 帖子文本 | LLM提取 | 具体菜品名 |
| recommendations_source | 系统标记 | 'llm_extracted' | 强制标记 |
| google_rating | Google API | Places API | verified=true |
| google_place_id | Google API | Places API | 真实ID |
| address | Google API | Places API | 真实地址 |

┌─────────────────────────────────────────────────────────────────────────┐
│                      严禁事项 (红色警戒)                                   │
└─────────────────────────────────────────────────────────────────────────┘

❌ 严禁使用关键词匹配提取餐厅名
   错误: if ('留湘' in text): restaurants.append('留湘')
   
❌ 严禁使用关键词匹配提取推荐菜
   错误: if ('牛肉' in text): dishes.append('牛肉')
   
❌ 严禁编造假数据
   错误: sentiment_score = 0.7 + (mentions - 1) * 0.05
   错误: google_rating = 4.0 + Math.random() * 0.5
   
❌ 严禁LLM失败时回退到关键词匹配
   错误: try LLM except use_keywords()  // 禁止！

✅ 正确做法: LLM失败时跳过，等待恢复或人工处理

┌─────────────────────────────────────────────────────────────────────────┐
│                      相关文档                                              │
└─────────────────────────────────────────────────────────────────────────┘

- docs/LLM_PIPELINE_GUIDE.md     - LLM提取完整规范
- PIPELINE.md                     - 主Pipeline文档
- docs/DATA_INTEGRITY_LESSON.md  - 2026-02-16事件记录
- CLEANUP_REPORT.md               - 过期脚本清理报告

┌─────────────────────────────────────────────────────────────────────────┐
│                      更新记录                                              │
└─────────────────────────────────────────────────────────────────────────┘

2026-02-16:
- 全部76家餐厅推荐菜LLM提取完成
- 清理所有过期关键词脚本 (12个已删除)
- 更新Pipeline文档
- 建立Cron Job规范
