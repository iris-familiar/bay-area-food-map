# Unified AI Pipeline v3.0

## 核心原则

**我本身就是AI，直接处理数据，不需要调用任何外部CLI**

## 合并后的单一Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                   Unified AI Pipeline                        │
│                    (单次AI会话完成所有)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: AI读取原始帖子                                       │
│    ├─ 读取 raw/v2/posts/*.json                              │
│    ├─ 提取标题、内容、评论                                    │
│    └─ 批量分析（一次处理所有帖子）                            │
│                                                              │
│  Step 2: AI提取（一次完成）                                   │
│    ├─ 🏪 餐厅名提取                                          │
│    │   └─ 识别帖子中提到的餐厅                                │
│    ├─ 🍽️  推荐菜提取                                          │
│    │   └─ 从推荐语境中提取具体菜品                            │
│    └─ 🏷️  Semantic Tags生成                                  │
│        ├─ scenes: 用餐场景分析                                │
│        ├─ vibes: 餐厅氛围判断                                 │
│        └─ practical: 实用特征识别                             │
│                                                              │
│  Step 3: 数据标准化                                          │
│    ├─ 名称标准化（去重、合并）                                │
│    ├─ 地址/区域标准化                                        │
│    └─ 菜系分类                                               │
│                                                              │
│  Step 4: Metrics计算（无需AI，纯计算）                        │
│    ├─ 口碑：情感分析（正负面词统计）                          │
│    ├─ 讨论度：总互动量                                        │
│    └─ 趋势：30天讨论占比                                      │
│                                                              │
│  Step 5: 外部验证（API调用）                                  │
│    ├─ Google Places API验证                                  │
│    └─ 获取真实评分和地址                                      │
│                                                              │
│  Step 6: 输出                                                │
│    ├─ restaurant_database.json                               │
│    ├─ search_mapping.json（AI生成映射）                      │
│    └─ QA报告                                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## AI提取Prompt模板

### 统一提取Prompt

```
分析以下Xiaohongshu帖子，提取所有餐厅信息：

帖子标题: {title}
帖子内容: {content}
评论: {comments}

请返回JSON格式：
{
  "restaurants": [
    {
      "name": "餐厅名",
      "cuisine": "菜系",
      "area": "区域",
      "recommended_dishes": ["推荐菜1", "推荐菜2"],
      "semantic_tags": {
        "scenes": ["date-night", "group-dining"],
        "vibes": ["lively", "authentic"],
        "practical": ["spicy", "budget"]
      },
      "confidence": 0.95
    }
  ]
}

提取规则：
1. 餐厅名必须是具体店名，不是菜系或通用词
2. 推荐菜必须有推荐语境（"必点"、"惊艳"、"推荐"）
3. tags基于帖子内容分析，不是猜测
4. 如果信息不明确，降低confidence
```

## 与旧Pipeline对比

| 旧Pipeline | Unified AI Pipeline |
|-----------|---------------------|
| 3个独立脚本 | 1个AI会话 |
| 3次外部CLI调用 | 0次CLI调用 |
| 多次文件IO | 内存中完成 |
| 30-40分钟 | 5-10分钟 |
| 可能格式不一致 | 统一输出格式 |

## Cron Job配置

```json
{
  "name": "小红书餐厅数据维护 - Unified AI",
  "schedule": "0 2 * * *",
  "payload": {
    "kind": "agentTurn",
    "message": "执行Unified AI Pipeline：\n\n1. 读取所有原始帖子 (raw/v2/posts/*.json)\n2. AI统一提取：餐厅名 + 推荐菜 + Semantic Tags\n3. 计算Metrics\n4. Google API验证\n5. 更新数据库和搜索映射\n\n要求：\n- 一次AI会话完成所有提取\n- 无需调用外部CLI\n- 直接输出结构化数据",
    "model": "kimi-coding/k2p5",
    "timeoutSeconds": 1800
  }
}
```

## 文件清单

### 新Pipeline文件
- `docs/UNIFIED_AI_PIPELINE.md` - 本文档
- `scripts/unified_ai_extraction.js` - 框架脚本（实际由AI直接执行）

### 废弃的旧脚本（已删除/归档）
- ~~kimi_llm_extract_v2.py~~ ❌
- ~~batch_extract_dishes_llm.py~~ ❌  
- ~~generate_semantic_tags_llm.py~~ ❌
- ~~generate_semantic_tags_simple.js~~ ❌

### 保留的脚本
- `calculate_real_metrics.js` - 纯计算，无需AI
- `verify_google_places_real.js` - API调用
- `update-search-mapping.js` - 数据转换
- `search_rotation.py` - 搜索轮换
- `qa/global-qa.js` - QA验证

## 执行流程（AI直接执行）

当Cron Job触发时，AI agent直接：

1. **读取数据**
   ```javascript
   const posts = fs.readFileSync('raw/v2/posts/*.json');
   ```

2. **AI分析（内存中完成）**
   ```
   分析所有帖子 → 提取餐厅 → 提取推荐菜 → 生成tags
   ```

3. **输出结果**
   ```javascript
   fs.writeFileSync('restaurant_database.json', JSON.stringify(results));
   ```

4. **后续步骤**
   - 计算metrics
   - Google验证
   - 更新映射

## 优势

✅ **简化** - 从3个脚本合并为1个AI会话
✅ **快速** - 减少多次IO和CLI调用开销
✅ **一致** - 统一的数据格式和提取逻辑
✅ **可控** - AI直接控制整个流程
✅ **可调试** - 单次会话可查看完整上下文

## 注意事项

⚠️ **Token消耗** - 批量处理大量帖子可能消耗较多token
⚠️ **超时风险** - 76家餐厅分析约需5-10分钟，设置足够timeout
⚠️ **错误处理** - 单次失败影响全部，需做好checkpoint
