#!/usr/bin/env python3
"""
更新版Cron Job配置 - 带轮换机制
只保留1个综合Job，但加入动态搜索词轮换
"""

import json

CRON_JOB = {
    "name": "小红书餐厅数据综合维护-v2",
    "description": "带轮换机制的每日数据维护",
    "schedule": {
        "kind": "cron",
        "expr": "0 2 * * *",  # 每天凌晨2点
        "tz": "America/Los_Angeles"
    },
    "payload": {
        "kind": "agentTurn",
        "message": """执行Bay Area Food Map综合维护任务 (v2轮换版)

## Phase 0: 获取今日搜索策略 (动态轮换)
```bash
cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map
python3 scripts/search_rotation.py > /tmp/today_queries.json
```

今日搜索词: (从轮换库中动态选择)
- 场景搜索: 2个 (根据周几轮换)
- 菜系搜索: 2个 (根据第几周轮换)  
- 卫星城市: 2个 (根据第几周轮换)

## Phase 1: 执行搜索 (使用今日轮换词)
```bash
# 读取今日搜索词
QUERIES=$(cat /tmp/today_queries.json | jq -r '.all_queries[]')

# 对每个搜索词执行Xiaohongshu搜索
for query in $QUERIES; do
  ./search.sh "$query"
  sleep 15
done
```

## Phase 2: LLM提取 (强制)
```bash
# 餐厅名提取 (LLM)
python3 scripts/kimi_llm_extract_v2.py

# 推荐菜提取 (LLM)  
python3 scripts/batch_extract_dishes_llm.py
```

## Phase 3: Metrics计算
```bash
node scripts/calculate_real_metrics.js
```

## Phase 4: Google验证
```bash
node scripts/verify_google_places_real.js
```

## Phase 5: QA验证
```bash
node qa/global-qa.js
```

## Phase 6: 部署
```bash
cp data/current/restaurant_database.json data/current/restaurant_database_v5_ui.json
```

## 轮换机制说明
- 场景搜索: 每天不同 (周一约会/周二家庭/周三一人食...)
- 菜系搜索: 每周轮换 (第1周中餐/第2周日料/第3周韩餐...)
- 卫星城市: 每周轮换 (第1周南湾/第2周半岛/第3周东湾...)

## 预计发现
- 每日新增: 0-2家
- 每周总计: 5-10家
- 每月覆盖: 20+城市/地区
""",
        "model": "kimi-coding/k2p5",
        "timeoutSeconds": 3600
    },
    "sessionTarget": "isolated",
    "notify": True
}

if __name__ == "__main__":
    print("🎯 更新版Cron Job (带轮换机制)")
    print("=" * 60)
    print(json.dumps(CRON_JOB, indent=2, ensure_ascii=False))
    print("")
    print("✅ 特点:")
    print("  • 只有1个Job (简化)")
    print("  • 搜索词每天/每周自动轮换")
    print("  • 覆盖场景+菜系+卫星城市")
    print("  • 不会重复搜索同样内容")
