#!/usr/bin/env python3
"""
通用搜索发现器 - 专注亚洲餐
用宽泛地域词搜索，从中筛选亚洲餐厅
"""

import json
from typing import List, Dict

# 湾区地域搜索词（通用）
LOCATION_QUERIES = [
    # 城市级
    "Mountain View美食",
    "Palo Alto美食", 
    "Cupertino美食",
    "Sunnyvale美食",
    "San Jose美食",
    "Fremont美食",
    "Milpitas美食",
    "Union City美食",
    "Santa Clara美食",
    
    # 区域级
    "南湾美食",
    "东湾美食",
    "半岛美食",
    "旧金山美食",
    "湾区美食",
    
    # 商圈/地标
    "Cupertino Village美食",
    "Valley Fair附近美食",
    "Santana Row美食",
    "Fremont Warm Springs美食",
    "Milpitas Great Mall美食",
]

# 亚洲菜系关键词（用于筛选）
ASIAN_CUISINES = {
    # 中餐细分
    "中餐", "川菜", "湘菜", "粤菜", "早茶", "点心", "火锅", "烧烤", 
    "拉面", "牛肉面", "兰州拉面", "云南菜", "新疆菜", "东北菜", "上海菜",
    "江浙菜", "台湾菜", "港式", "麻辣烫", "麻辣香锅", "串串", "冒菜",
    "包子", "饺子", "生煎", "小笼包", "煎饼", "凉皮", "肉夹馍",
    
    # 日料
    "日料", "日本料理", "寿司", "拉面", "日式", "烧鸟", "居酒屋", 
    "天妇罗", "寿喜烧", "和牛", "刺身", "丼饭", "乌冬", "荞麦面",
    
    # 韩餐
    "韩餐", "韩国料理", "烤肉", "韩式", "炸鸡", "泡菜", "石锅拌饭",
    "部队锅", "冷面", "参鸡汤", "烤牛肠",
    
    # 东南亚
    "泰国菜", "泰餐", "泰式", "咖喱", "冬阴功", "芒果糯米饭",
    "越南菜", "越南粉", "pho", "春卷", "法棍三明治",
    "新加坡菜", "海南鸡饭", "肉骨茶",
    "马来西亚菜", "laksa", "炒粿条",
    "印尼菜", "印尼炒饭",
    "缅甸菜", "柬埔寨菜",
    
    # 其他亚洲
    "印度菜", "咖喱", "印度烤饼", "biryani", "samosa",
    "尼泊尔菜", "蒙古烤肉", "中亚菜", "阿富汗菜",
}

# 排除的非亚洲餐
NON_ASIAN_EXCLUDE = {
    "意大利", "意式", "pizza", "披萨", "pasta",
    "法国", "法餐", "French",
    "墨西哥", "taco", "burrito", "enchilada",
    "美国", "汉堡", "牛排", "BBQ", "烧烤(美式)",
    "希腊", "地中海",
    "西班牙", "tapas",
    "德国", "香肠", "猪肘",
    "俄罗斯", "东欧",
    "中东", "黎巴嫩", "土耳其", "kebab",
    "埃塞俄比亚", "非洲",
    "面包", "bakery", "甜品", "蛋糕", "咖啡", "奶茶店",
}

def generate_search_plan(output_path: str):
    """生成亚洲餐专用搜索计划"""
    
    plan = {
        "strategy": "通用地域搜索 + 亚洲餐筛选",
        "generated_at": "2026-02-15",
        "total_queries": len(LOCATION_QUERIES),
        "queries": []
    }
    
    for query in LOCATION_QUERIES:
        plan["queries"].append({
            "search_term": query,
            "type": "location_generic",
            "filter_rules": {
                "include": list(ASIAN_CUISINES),
                "exclude": list(NON_ASIAN_EXCLUDE)
            },
            "expected_results": "从结果中筛选提及亚洲菜的帖子",
            "priority": "high" if "Cupertino" in query or "Milpitas" in query or "Fremont" in query else "medium"
        })
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 亚洲餐搜索计划已生成: {output_path}")
    print(f"\n📋 计划包含:")
    print(f"   - {len(LOCATION_QUERIES)} 个地域搜索词")
    print(f"   - {len(ASIAN_CUISINES)} 个亚洲菜系标签")
    print(f"   - 排除 {len(NON_ASIAN_EXCLUDE)} 个非亚洲标签")
    
    return plan

def print_sample_strategy():
    """打印执行策略示例"""
    print("\n🎯 执行策略:")
    print("=" * 50)
    
    print("\n1️⃣ 搜索 'Mountain View美食'")
    print("   ↓ 获取20个相关帖子")
    print("   ↓ AI筛选包含亚洲餐关键词的帖子")
    print("   ↓ 从帖子中提取餐厅名")
    print("   ↓ 验证餐厅类型和地址")
    print("   → 发现3-5家新的亚洲餐厅候选")
    
    print("\n2️⃣ 重复上述流程 for each location:")
    for q in LOCATION_QUERIES[:5]:
        print(f"   • {q}")
    print(f"   ... 共{len(LOCATION_QUERIES)}个地域")
    
    print("\n3️⃣ 汇总去重")
    print("   ↓ 合并所有候选餐厅")
    print("   ↓ 去重（同餐厅不同叫法）")
    print("   ↓ 按提及次数排序")
    print("   → 预计发现20-40家新亚洲餐厅")

if __name__ == "__main__":
    output = "data/asian_restaurant_discovery_plan.json"
    generate_search_plan(output)
    print_sample_strategy()
