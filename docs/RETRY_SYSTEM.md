# 小红书数据采集重试系统

## 概述

由于小红书API的限制（Rate Limiting、Token过期等），部分帖子可能暂时无法采集。本系统提供自动重试机制，确保数据完整性。

## 系统组件

### 1. 重试队列管理器 (`scripts/retry_queue_manager.py`)

核心组件，管理失败帖子的重试队列。

**功能：**
- 添加失败帖子到队列
- 自动计算下次重试时间（指数退避 + 随机抖动）
- 跟踪重试次数
- 标记成功/永久失败

**重试策略：**
| 重试次数 | 等待时间 | 说明 |
|---------|---------|------|
| 1st | 5分钟 | 初始重试 |
| 2nd | 15分钟 | 指数退避 |
| 3rd | 30分钟 | 指数退避 |
| 4th | 1小时 | 指数退避 |
| 5th | 2小时 | 最大延迟 |
| 6th+ | 放弃 | 标记永久失败 |

### 2. 批量重试脚本 (`scripts/batch_retry_collection.py`)

手动触发重试采集。

**使用方法：**
```bash
cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map
python3 scripts/batch_retry_collection.py
```

### 3. 定时重试任务 (Cron Job)

自动每6小时执行一次重试。

**任务ID:** `5300769c-5295-44f8-b4c2-d238315786a9`

**查看状态：**
```bash
openclaw cron list
```

**手动触发：**
```bash
openclaw cron run 5300769c-5295-44f8-b4c2-d238315786a9
```

## 数据文件

### 重试队列 (`data/raw/v2/retry_queue.json`)

```json
{
  "pending": [
    {
      "note_id": "帖子ID",
      "xsec_token": "Token",
      "title": "帖子标题",
      "failure_reason": "失败原因",
      "retry_count": 0,
      "first_added": "首次添加时间",
      "last_failure": "最后失败时间",
      "next_retry": "下次重试时间",
      "status": "pending"
    }
  ],
  "failed_permanently": [...],
  "success_history": [...]
}
```

## 当前状态

**待重试帖子：** 6条

1. milpitas，你们也吃太好了吧！
2. 湾区有复刻黎大厨的人生鸡饭了
3. Santa Clara和Mountain View 探店
4. 湾区🥢 我心中最Top级上海餐馆
5. 我在湾区咪西咪西
6. 湾区最贵拉面🍜Wakusei替大家交学费了

## 使用流程

### 场景1：新帖子采集失败

当采集帖子失败时，自动添加到重试队列：

```python
from scripts.retry_queue_manager import RetryQueueManager

manager = RetryQueueManager()
manager.add_to_retry(
    note_id="帖子ID",
    xsec_token="Token",
    title="帖子标题",
    failure_reason="API限制"
)
```

### 场景2：手动触发重试

```bash
python3 scripts/batch_retry_collection.py
```

### 场景3：检查队列状态

```bash
python3 scripts/retry_queue_manager.py
```

### 场景4：查看特定帖子是否可以处理

```python
manager = RetryQueueManager()
if manager.should_process_now("帖子ID"):
    # 可以处理
    pass
```

## 注意事项

1. **Token过期**：xsec_token可能随时间失效，如果多次重试失败，可能需要重新搜索获取新token

2. **Rate Limiting**：小红书API对频繁请求有限制，重试间隔设计考虑了这一点

3. **帖子删除**：如果帖子确实被删除，5次重试后会标记为永久失败

4. **手动干预**：对于特别重要的帖子，可以手动在小红书APP查看，然后手动补充数据

## 监控

查看重试队列状态：
```bash
cat data/raw/v2/retry_queue.json | python3 -m json.tool
```

查看下次自动重试时间：
```bash
openclaw cron list
```

## 故障排查

**问题：重试多次仍然失败**
- 可能原因：Token已过期
- 解决方案：重新搜索该帖子获取新token，然后手动添加

**问题：队列中帖子太多**
- 可能原因：API限制严格
- 解决方案：增加重试间隔，或分散到不同时间段采集

**问题：想立即重试所有帖子**
- 解决方案：重置所有帖子的next_retry时间为现在

## 未来优化

1. **智能Token刷新**：检测token过期，自动尝试刷新
2. **优先级队列**：重要帖子优先重试
3. **多账号轮换**：使用多个小红书账号分散请求
4. **代理IP池**：使用不同IP避免被封

---

**创建时间：** 2026-02-16  
**最后更新：** 2026-02-16
