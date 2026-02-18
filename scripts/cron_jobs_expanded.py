#!/usr/bin/env python3
"""
扩展版Cron Job配置
包含多源采集策略
"""

import json

CRON_JOBS = {
    "jobs": [
        {
            "name": "bay-area-food-daily-update",
            "description": "每日基础增量更新",
            "schedule": {
                "kind": "cron",
                "expr": "0 2 * * *",
                "tz": "America/Los_Angeles"
            },
            "payload": {
                "kind": "agentTurn",
                "message": """执行Bay Area Food Map每日增量更新。

【任务范围】
1. 监控已有76家餐厅的新提及
2. 检查是否有新的高engagement帖子
3. 更新metrics和趋势

【强制要求】
- 餐厅名用LLM提取
- 推荐菜用LLM提取  
- 严禁关键词匹配

【预计新增】0-2家/天""",
                "model": "kimi-coding/k2p5",
                "timeoutSeconds": 1800
            },
            "sessionTarget": "isolated",
            "notify": True
        },
        
        {
            "name": "bay-area-food-weekly-discovery",
            "description": "每周深度发现 - 菜系垂直搜索",
            "schedule": {
                "kind": "cron", 
                "expr": "0 3 * * 0",
                "tz": "America/Los_Angeles"
            },
            "payload": {
                "kind": "agentTurn",
                "message": """执行Bay Area Food Map每周深度发现。

【采集策略】策略2: 菜系垂直搜索
搜索词:
- 湾区川菜、湾区湘菜、湾区粤菜、湾区火锅
- 湾区日料、湾区寿司、湾区拉面
- 湾区韩餐、湾区泰国菜、湾区越南菜

【筛选规则】
- 只保留亚洲餐厅
- engagement > 50
- 有明确餐厅名

【LLM提取】
- 餐厅名 (kimi_llm_extract_v2.py)
- 推荐菜 (batch_extract_dishes_llm.py)

【预计新增】5-10家/周""",
                "model": "kimi-coding/k2p5",
                "timeoutSeconds": 3600
            },
            "sessionTarget": "isolated",
            "notify": True
        },
        
        {
            "name": "bay-area-food-monthly-expansion", 
            "description": "每月大范围扩展 - 卫星城市",
            "schedule": {
                "kind": "cron",
                "expr": "0 4 1 * *",
                "tz": "America/Los_Angeles"
            },
            "payload": {
                "kind": "agentTurn",
                "message": """执行Bay Area Food Map每月大范围扩展。

【采集策略】策略1: 卫星城市覆盖
新增地区:
- Los Gatos, Saratoga, Campbell
- Los Altos, Menlo Park, Redwood City
- Newark, Hayward, San Leandro
- San Mateo, Burlingame, Millbrae
- San Francisco (SF中餐、SF日料)

【搜索模板】{城市}美食
【筛选】亚洲餐厅

【数据Pipeline】
1. Xiaohongshu搜索
2. LLM提取餐厅名
3. LLM提取推荐菜
4. Google Places验证
5. QA验证

【质量控制】
- 每周最多新增50家
- 必须有Google评分>3.5
- engagement > 50

【预计新增】20-30家/月""",
                "model": "kimi-coding/k2p5",
                "timeoutSeconds": 7200
            },
            "sessionTarget": "isolated",
            "notify": True
        },
        
        {
            "name": "bay-area-food-comment-mining",
            "description": "评论挖掘 - 从已有posts发现新餐厅",
            "schedule": {
                "kind": "cron",
                "expr": "0 5 * * 3",
                "tz": "America/Los_Angeles"
            },
            "payload": {
                "kind": "agentTurn",
                "message": """执行评论挖掘任务。

【策略】策略4: 从comments中发现

【步骤】
1. 读取所有82个posts的comments
2. LLM分析comments内容
3. 识别被提及但未记录的餐厅
4. 验证是否已存在数据库中
5. 新餐厅入库

【示例发现】
"听说XXX也不错" → 发现新餐厅XXX
"比YYY好吃" → 发现对比餐厅YYY

【预计新增】5-10家/周""",
                "model": "kimi-coding/k2p5",
                "timeoutSeconds": 3600
            },
            "sessionTarget": "isolated",
            "notify": False
        }
    ]
}

if __name__ == "__main__":
    # 保存配置
    with open('/tmp/cron_jobs_expanded.json', 'w') as f:
        json.dump(CRON_JOBS, f, indent=2, ensure_ascii=False)
    
    print("🎯 扩展版Cron Job配置")
    print("=" * 60)
    for job in CRON_JOBS["jobs"]:
        print(f"\n📅 {job['name']}")
        print(f"   描述: {job['description']}")
        print(f"   时间: {job['schedule']['expr']}")
        print(f"   超时: {job['payload']['timeoutSeconds']}秒")
