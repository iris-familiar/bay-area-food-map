# 去重与调度策略设计

## 🎯 核心原则

**宁可慢，不可重复** - 保证数据质量优先于速度

---

## 📊 去重机制 (3层防护)

### 第1层：Post ID 去重
```python
# 每个帖子有唯一ID
if post_id in database:
    skip("已抓取过")
```

### 第2层：内容指纹去重
```python
# 防止同一个内容换ID发布
content_hash = md5(title + content[:100])
if content_hash in database:
    skip("内容重复")
```

### 第3层：相似度检测 (可选)
```python
# 相似内容合并
similarity = text_similarity(new_post, existing_post)
if similarity > 0.85:
    merge("相似内容，合并评价")
```

---

## ⏰ 抓取规模控制

### 每日限额 (保守策略)
```yaml
每日上限:
  max_posts: 50          # 最多50个新帖子
  max_requests: 30       # 最多30次搜索请求
  max_restaurants: 10    # 最多深度追踪10家餐厅
  
单次任务:
  posts_per_query: 5     # 每个搜索词取前5个
  queries_per_job: 10    # 每次任务10个搜索词
  max_depth: 3           # 每家餐厅最多3层深度
```

### 分批策略
```
批次1 (第1天): 10家高优先级餐厅
批次2 (第2天): 10家中等优先级
批次3 (第3天): 剩余餐厅
```

---

## 🕐 间隔时间设计

### 请求间隔 (防封)
```python
# 基础间隔 + 随机抖动
base_delay = 8  # 8秒
random_jitter = random(0, 4)  # 0-4秒随机
actual_delay = 8-12秒  # 正态分布
```

### 餐厅切换间隔
```python
# 切换不同餐厅时，延长间隔
restaurant_switch_delay = 30  # 30秒
```

### 错误后等待
```python
# 遇到错误，指数退避
if error:
    wait(60)          # 第1次错误等60秒
    wait(120)         # 第2次错误等2分钟
    wait(300)         # 第3次错误等5分钟
    skip("放弃该餐厅")
```

### 日额度满后
```python
if daily_limit_reached:
    cooldown(3600)    # 冷却1小时
    check_next_day()  # 检查次日额度
```

---

## 🔄 重抓间隔策略

根据餐厅热度决定重抓频率：

| 餐厅类型 | 数据来源 | 重抓间隔 | 原因 |
|---------|---------|---------|------|
| 🔥 热门 | 5+帖子或100+互动 | 3天 | 评价变化快，需及时更新 |
| 📊 中等 | 3-4帖子 | 7天 | 定期更新趋势 |
| 🟢 稳定 | 5+帖子且互动稳定 | 14天 | 数据充足，降低频率 |
| ❓ 数据不足 | <2帖子 | 1天 | 尽快补充基础信息 |

---

## 🎭 反检测策略

### 时间伪装
```python
# 只在"正常"时间段抓取
active_hours = [10-12, 14-17, 19-22]
if now not in active_hours:
    sleep_until_next_window()
```

### 行为模拟
```python
# 抓取前模拟人类行为
scroll_page()           # 滚动页面
random_mouse_move()     # 随机鼠标移动
view_multiple_posts()   # 一次浏览多个
```

### 请求头轮换
```python
user_agents = [
    "iPhone iOS 17...",
    "Android 14...",
]
rotate_user_agent()
```

---

## 📈 监控指标

### 去重效率
```
目标: 重复率 < 10%
监控: 每周统计 duplicate / total
```

### 抓取效率
```
目标: 新数据占比 > 70%
监控: new_posts / total_fetched
```

### 速度控制
```
目标: 平均 8-12秒/请求
监控: 避免触发 rate limit
```

---

## 🚀 实施建议

### Phase 1: 基础去重 (今天)
- [x] SQLite数据库记录已抓取
- [x] Post ID + 内容Hash双重验证
- [ ] 集成到现有pipeline

### Phase 2: 调度控制 (本周)
- [ ] 每日限额硬限制
- [ ] 自动分批执行
- [ ] 错误重试机制

### Phase 3: 智能优化 (下周)
- [ ] 根据重复率动态调整
- [ ] 热门餐厅自动加速
- [ ] 低质量源自动降级

---

## 💡 关键设计决策

1. **为什么限制50帖子/天？**
   - 小红书反爬严格，保守策略防封号
   - 质量 > 数量，深度分析比广度重要

2. **为什么3-14天重抓？**
   - 热门餐厅评价变化快（3天）
   - 普通用户不会天天发同一餐厅（14天足够）

3. **为什么8-12秒间隔？**
   - 模拟正常用户浏览速度
   - 太快像机器人，太慢效率低

---

**文件位置:**
- 调度器: `scripts/fetch_scheduler.py`
- 可执行计划: `scripts/recursive_search_plan_*_executable.json`

**使用方法:**
```bash
# 生成带调度的执行计划
python3 scripts/fetch_scheduler.py search_plan.json

# 实际执行（干运行模式）
python3 scripts/fetch_scheduler.py search_plan.json --execute
```

