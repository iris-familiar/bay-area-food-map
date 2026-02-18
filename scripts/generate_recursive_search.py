#!/usr/bin/env python3
"""
递归搜索脚本 - 基于已有餐厅进行深度挖掘
⚠️ 所有搜索必须包含"湾区"限定，避免搜到其他城市同名餐厅
"""

import json
import sys
from typing import List, Dict
from datetime import datetime

# 搜索模板 - 必须包含湾区限定
SEARCH_TEMPLATES = [
    "湾区 {name}",
    "湾区 {name} 怎么样",
    "湾区 {name} 推荐",
    "湾区 {name} 踩雷",
    "湾区 {name} 避雷",
    "湾区 {name} 人均",
    "湾区 {name} 价格",
    "湾区 {name} 好吃吗",
    "湾区 {name} 必点",
    "湾区 {name} 菜单",
]

# 湾区验证关键词 - 用于过滤结果
BAY_AREA_KEYWORDS = [
    "湾区", "Bay Area", "bayarea",
    "San Francisco", "SF", "三番",
    "Palo Alto", "帕罗奥图",
    "Cupertino", "库比蒂诺",
    "Fremont", "弗里蒙特", "费利蒙",
    "Milpitas", "米尔皮塔斯",
    "Sunnyvale", "森尼韦尔",
    "Mountain View", "山景城",
    "San Jose", "圣何塞", "圣荷西",
    "东湾", "East Bay",
    "南湾", "South Bay", 
    "半岛", "Peninsula",
    "Union City", " Newark", "Hayward",
    "Saratoga", "Los Gatos", "Campbell",
    "Menlo Park", "Atherton", "Redwood City",
    "San Mateo", "Burlingame",
    "Walnut Creek", "Dublin", "Pleasanton",
    "Berkeley", "Oakland", "Alameda"
]

def is_bay_area_content(text: str) -> bool:
    """验证内容是否在湾区"""
    text_lower = text.lower()
    return any(keyword.lower() in text_lower for keyword in BAY_AREA_KEYWORDS)

def generate_recursive_queries(restaurant_name: str) -> List[str]:
    """为单个餐厅生成递归搜索词"""
    queries = []
    for template in SEARCH_TEMPLATES:
        query = template.format(name=restaurant_name)
        queries.append(query)
    return queries

def load_existing_restaurants(db_path: str) -> List[Dict]:
    """加载数据库中的餐厅"""
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('restaurants', [])
    except Exception as e:
        print(f"❌ 加载数据库失败: {e}")
        return []

def generate_search_plan(restaurants: List[Dict], limit: int = None) -> Dict:
    """生成搜索计划"""
    plan = {
        "generated_at": datetime.now().isoformat(),
        "total_restaurants": len(restaurants),
        "queries_per_restaurant": len(SEARCH_TEMPLATES),
        "estimated_total_queries": 0,
        "restaurants": []
    }
    
    targets = restaurants[:limit] if limit else restaurants
    
    for r in targets:
        name = r.get('name', '')
        name_en = r.get('name_en', '')
        
        # 为主名称生成搜索词
        queries = generate_recursive_queries(name)
        
        # 如果有英文名，也搜索英文名
        if name_en and name_en != name:
            queries.extend([
                f"湾区 {name_en}",
                f"湾区 {name_en} review",
                f"湾区 {name_en} 推荐"
            ])
        
        # 计算优先级
        priority_info = calculate_priority(r)
        
        restaurant_plan = {
            "id": r.get('id'),
            "name": name,
            "name_en": name_en,
            "type": r.get('type'),
            "location": r.get('location'),
            "current_sources": r.get('sources', []),
            "search_queries": queries,
            "priority": priority_info["level"],
            "priority_reason": priority_info["reason"],
            "priority_description": priority_info["description"]
        }
        
        plan["restaurants"].append(restaurant_plan)
        plan["estimated_total_queries"] += len(queries)
    
    return plan

def calculate_priority(restaurant: Dict) -> Dict:
    """计算搜索优先级和原因"""
    sources = restaurant.get('sources', [])
    metrics = restaurant.get('metrics', {})
    engagement = metrics.get('discussion_volume', {}).get('total_engagement', 0)
    
    source_count = len(sources)
    
    # 优先级逻辑：
    # - 数据来源少：需要补充基础信息
    # - 数据来源多（火的餐厅）：持续追踪最新评价
    
    if source_count < 2:
        return {
            "level": "high",
            "reason": "insufficient_data",
            "description": f"只有{source_count}个来源，需要补充基础信息"
        }
    elif source_count >= 6 or engagement > 100:
        return {
            "level": "high", 
            "reason": "trending",
            "description": f"热门餐厅（{source_count}个来源, {engagement}互动），持续追踪最新评价"
        }
    elif source_count < 4:
        return {
            "level": "medium",
            "reason": "moderate",
            "description": f"中等热度（{source_count}个来源），定期更新"
        }
    else:
        return {
            "level": "low",
            "reason": "stable",
            "description": f"数据充足（{source_count}个来源），降低频率"
        }

def deduplicate_queries(plan: Dict, existing_raw_dir: str = None) -> Dict:
    """去重：避免搜索已抓取的帖子"""
    # TODO: 读取raw目录，排除已存在的source_id
    # 目前简单实现：基于已有sources去重
    
    print("⚠️ 去重功能待完善：需要对接实际数据源")
    return plan

def save_search_plan(plan: Dict, output_path: str):
    """保存搜索计划"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 搜索计划已保存: {output_path}")
    print(f"\n📊 计划概况:")
    print(f"   - 餐厅数量: {plan['total_restaurants']}")
    print(f"   - 预计搜索次数: {plan['estimated_total_queries']}")
    
    # 优先级分布
    priority_reasons = {}
    for r in plan['restaurants']:
        reason = r.get('priority_reason', 'unknown')
        priority_reasons[reason] = priority_reasons.get(reason, 0) + 1
    
    print(f"   - 数据不足(需补充): {priority_reasons.get('insufficient_data', 0)} 家")
    print(f"   - 热门餐厅(持续追踪): {priority_reasons.get('trending', 0)} 家")
    print(f"   - 中等热度: {priority_reasons.get('moderate', 0)} 家")
    print(f"   - 数据充足: {priority_reasons.get('stable', 0)} 家")

def generate_shell_script(plan: Dict, output_path: str):
    """生成可执行的shell脚本"""
    lines = [
        "#!/bin/bash",
        "# 递归搜索脚本 - 基于已有餐厅深度挖掘",
        "# ⚠️ 所有搜索已自动添加'湾区'限定",
        "",
        f"# 生成时间: {plan['generated_at']}",
        f"# 餐厅数量: {plan['total_restaurants']}",
        "",
        "# 配置",
        "cd ~/.openclaw/skills/xiaohongshu || exit 1",
        "OUTPUT_DIR=\"${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map/raw/recursive_$(date +%Y%m%d)\"",
        "mkdir -p $OUTPUT_DIR",
        "",
        "# 延迟配置（防封）",
        "DELAY_BETWEEN_REQUESTS=10  # 秒",
        "MAX_POSTS_PER_QUERY=3  # 每个搜索词最多3个帖子",
        "",
        'echo "🚀 开始递归搜索..."',
        "",
    ]
    
    # 按优先级排序
    sorted_restaurants = sorted(
        plan['restaurants'], 
        key=lambda x: {'high': 0, 'medium': 1, 'low': 2}[x['priority']]
    )
    
    for r in sorted_restaurants:
        desc = r.get('priority_description', '')
        name = r['name']
        lines.append(f"# {name} [{r['priority']}] - {desc}")
        
        # 只取前2个最重要的搜索词（避免请求过多）
        important_queries = r['search_queries'][:2]
        
        for query in important_queries:
            # 实际调用 xiaohongshu search
            safe_query = query.replace(' ', '_').replace('/', '_')
            lines.append(f'echo "🔍 搜索: {query}"')
            lines.append(f'./scripts/search.sh "{query}" > "$OUTPUT_DIR/recursive_' + name + f'_{safe_query}.json" 2>&1 || echo "⚠️ 搜索失败: {query}"')
            lines.append(f"sleep $DELAY_BETWEEN_REQUESTS")
        
        lines.append("")
    
    lines.extend([
        'echo "✅ 递归搜索完成"',
        'echo "输出目录: $OUTPUT_DIR"',
        "",
        "# 汇总结果",
        "cd ${HOME}/.openclaw/workspace-planner/projects/bay-area-food-map",
        "echo \"📊 本次递归搜索发现: $(ls $OUTPUT_DIR/*.json 2>/dev/null | wc -l) 个结果文件\"",
    ])
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    # 添加执行权限
    import os
    os.chmod(output_path, 0o755)
    
    print(f"✅ Shell脚本已生成: {output_path}")

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "data/current/restaurant_database.json"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None  # 限制处理的餐厅数量
    
    print("🔍 递归搜索计划生成器")
    print("=" * 50)
    print(f"数据库: {db_path}")
    print(f"⚠️ 所有搜索将自动添加'湾区'限定")
    print()
    
    # 加载餐厅
    restaurants = load_existing_restaurants(db_path)
    if not restaurants:
        print("❌ 没有加载到餐厅数据")
        return
    
    print(f"📋 已加载 {len(restaurants)} 家餐厅")
    
    # 生成搜索计划
    plan = generate_search_plan(restaurants, limit)
    
    # 去重
    plan = deduplicate_queries(plan)
    
    # 保存计划
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    plan_path = f"scripts/recursive_search_plan_{timestamp}.json"
    save_search_plan(plan, plan_path)
    
    # 生成shell脚本
    script_path = f"scripts/run_recursive_search_{timestamp}.sh"
    generate_shell_script(plan, script_path)
    
    print()
    print("📝 下一步:")
    print(f"   1. 查看搜索计划: cat {plan_path}")
    print(f"   2. 执行搜索: bash {script_path}")
    print("   3. 或者手动选择高优先级餐厅进行搜索")

if __name__ == "__main__":
    main()
