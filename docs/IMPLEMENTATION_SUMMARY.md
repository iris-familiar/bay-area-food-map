# 小红书数据获取迭代 - 实施总结

**日期**: 2026-02-15  
**负责人**: Travis (AI管家)  
**状态**: ✅ 方案设计与工具开发完成，待执行

---

## 一、核心问题解决

### 问题1: 数据质量保障 ✅

**去重策略 (3级防护)**
```
Level 1: 精确匹配
  └─ 标准化名称 + 地址完全匹配
  
Level 2: 别名映射  
  └─ 王家卫→王家味, 留湘→Ping's Bistro...
  
Level 3: Fuzzy匹配
  └─ 名称相似度>0.8 + 地址相似度>0.5
```

**质量过滤系统**
| 维度 | 标准 | 实现 |
|------|------|------|
| 硬性过滤 | 评论≥5, 内容≥50字, ≤2年 | Python脚本自动过滤 |
| 垃圾检测 | 广告关键词, 可疑模式 | 关键词+正则匹配 |
| 质量评分 | 0-100分 (互动+内容+作者+时效) | 加权算法 |

**过滤效果预期**: 从原始数据中保留约30-40%的高质量内容

### 问题2: 高效获取更多数据 ✅

**搜索关键词矩阵 (40+组合)**
```
地理维度 × 菜系维度 × 场景维度

地理: 湾区、旧金山、南湾、Cupertino、Fremont、东湾、半岛...
菜系: 中餐、川菜、湘菜、火锅、日料、韩餐、越南菜...
场景: 探店、约会、聚餐、踩雷、避雷、必吃、宝藏...
```

**递归发现机制**
1. 从评论区提取其他餐厅提及 ("XXX也不错"、"推荐YYY")
2. 追踪高质量作者的历史帖子
3. 自动加入搜索队列

**Pipeline自动化**
```bash
./pipeline.sh full  # 一键执行完整流程
```

**预期数据增长**:
- 当前: 4帖子 → 21餐厅
- 目标: 100+帖子 → 100+餐厅

---

## 二、新增工具/脚本

| 文件 | 用途 | 位置 |
|------|------|------|
| `pipeline.sh` | Pipeline总控脚本 | `scripts/` |
| `fetch_xiaohongshu_data.sh` | 批量搜索+获取 | `scripts/` |
| `filter_quality_posts.py` | 质量过滤引擎 | `scripts/` |
| `dedupe_restaurants.py` | 去重合并引擎 | `scripts/` |
| `DATA_PIPELINE.md` | 完整文档 | `docs/` |
| `data_quality_strategy.md` | 策略设计文档 | `docs/` |

---

## 三、UI改进 (已完成)

### 改进1: Glossary术语指南 ✅
- 位置: Dashboard页面底部
- 内容: Discussion Volume、Sentiment Analysis、Trend Analysis、验证状态详解
- 价值: 帮助用户理解Metrics含义

### 改进2: Google Maps链接 ✅
- 位置: 餐厅详情Modal的地址部分
- 功能: 点击地址 → 新标签页打开Google Maps
- 搜索关键词: 餐厅名 + 地址

### 改进3: 增强排序功能 ✅
排序选项扩展到9个:
- 讨论度 (高→低 / 低→高)
- 情感分 (高→低 / 低→高)
- 趋势 (升→降 / 降→升)
- Google评分 (高→低 / 低→高)
- 名称 (A→Z)

---

## 四、项目结构重构 ✅

```
workspace-planner/
└── projects/
    └── bay-area-food-map/
        ├── index.html              ← V3 Dashboard
        ├── data/
        │   ├── current/            ← 最新数据
        │   ├── archive/            ← 历史版本
        │   └── filtered/           ← 过滤后数据
        ├── docs/
        │   ├── DATA_PIPELINE.md    ← 新!
        │   ├── data_quality_strategy.md  ← 新!
        │   └── ...
        ├── raw/                    ← 原始数据
        ├── scripts/                ← 新!
        │   ├── pipeline.sh
        │   ├── fetch_xiaohongshu_data.sh
        │   ├── filter_quality_posts.py
        │   └── dedupe_restaurants.py
        └── assets/
```

---

## 五、执行计划

### Phase 1: 数据扩展 (建议本周执行)

```bash
# 1. 确保小红书skill已启动
cd ~/.agents/skills/xiaohongshu/scripts
./start-mcp.sh
./status.sh  # 确认登录状态

# 2. 执行完整pipeline
cd ~/projects/bay-area-food-map/scripts
./pipeline.sh full

# 3. 监控执行
# 预计耗时: 30-60分钟 (取决于rate limit)
# 预期结果: 100+帖子，40+餐厅
```

### Phase 2: 验证与调优 (数据获取后)

1. **去重效果检查**
   - 随机抽样10%餐厅人工检查
   - 确认无重复条目

2. **质量评估**
   - 查看_filter_report.json
   - 调整过滤阈值（如需要）

3. **Google验证**
   ```bash
   # 批量验证
   for restaurant in $(jq -r '.restaurants[].name' data/current/restaurants_deduped.json); do
       goplaces search "$restaurant" --json
   done
   ```

### Phase 3: Dashboard更新 (数据就绪后)

1. 替换数据库文件
2. 更新Glossary中的统计数据
3. 重新部署index.html

---

## 六、风险与应对

| 风险 | 可能性 | 影响 | 应对策略 |
|------|--------|------|----------|
| Rate limit限制 | 中 | 获取速度变慢 | 增加sleep间隔，分批执行 |
| 验证码/登录过期 | 中 | 获取中断 | 提前检查状态，自动重试 |
| 去重误判 | 低 | 数据丢失 | 人工抽样检查，调优阈值 |
| 垃圾帖漏网 | 中 | 数据污染 | 多轮过滤，关键词库更新 |

---

## 七、其他想法

### 1. 数据监控看板
建议建立一个自动化监控脚本，每周运行：
```bash
# cron job: 每周日凌晨3点
0 3 * * 0 cd ~/projects/bay-area-food-map/scripts && ./pipeline.sh fetch
```

### 2. 用户反馈机制
在Dashboard添加"报告错误"按钮：
- 餐厅已关门
- 地址错误
- 重复条目
- 新增发现

### 3. 多平台交叉验证
未来可扩展：
- Yelp API (英文评价)
- Google Reviews (官方数据)
- 大众点评 (如果回国)

### 4. 价格趋势追踪
监控餐厅价格变化：
- 抓取菜单图片OCR
- 追踪人均消费变化
- 发现性价比变化

---

## 八、待少爷决策事项

1. **何时执行数据获取？**
   - 建议: 本周内执行 `./pipeline.sh full`
   - 需要: 确保小红书skill已启动且登录正常

2. **质量阈值调整？**
   - 当前: 评论≥5, 质量分≥40
   - 选项: 更严格(评论≥10, 分≥50) 或更宽松

3. **自动化频率？**
   - 建议: 每周自动增量更新
   - 需要: 配置cron job

4. **是否需要Yelp数据？**
   - 优点: 英文评价，补充华人社区外信息
   - 缺点: 需要额外API key，数据格式不同

---

## 附录: 快速命令参考

```bash
# 进入项目目录
cd ~/projects/bay-area-food-map

# 查看当前数据
./scripts/pipeline.sh stats

# 执行完整pipeline
./scripts/pipeline.sh full

# 仅获取新数据
./scripts/pipeline.sh fetch

# 仅过滤现有数据
./scripts/pipeline.sh filter

# 清理临时文件
./scripts/pipeline.sh clean

# 启动小红书skill
cd ~/.agents/skills/xiaohongshu/scripts
./start-mcp.sh
```

---

**总结**: 所有技术方案已就绪，工具已开发完成。等待少爷确认后即可执行大规模数据获取。🎩