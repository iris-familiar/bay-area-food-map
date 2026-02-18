import json
from typing import Dict, List

# 增强的语义标签规则
SEMANTIC_RULES = {
    "scenes": {
        "family-friendly": ["带娃", "孩子", "儿童", "family", "kid", "baby", "亲子", "小朋友", "全家", "老人", "长辈"],
        "date-night": ["约会", "情侣", "浪漫", "date", "anniversary", "二人世界", "烛光", "暧昧", "脱单"],
        "group-dining": ["聚餐", "聚会", "团建", "party", "group", "多人", "包间", "包厢", "宴请", "请客", "朋友", "同事", "生日", "庆祝"],
        "business": ["商务", "谈事", "客户", "business", "formal", "正式", "应酬"],
        "casual": ["随便吃", "快餐", "简餐", "casual", "日常", "工作餐", "一人食", " lunch"],
        "solo-dining": ["一人食", "单身", "自己", "独自", "solo"]
    },
    "vibes": {
        "quiet": ["安静", "清静", "适合聊天", "quiet", "peaceful", "不吵", "私密"],
        "lively": ["热闹", "有气氛", "烟火气", "lively", "bustling", "人气", "火爆", "排队", "等位"],
        "cozy": ["温馨", "舒适", "cozy", "warm", "像家一样", "亲切", "温馨"],
        "fancy": ["高档", "精致", "fancy", "upscale", "luxury", "高级", "米其林", "fine dining"],
        "hipster": ["网红", "打卡", "拍照", "instagram", "颜值", "出片", "小红书", "推荐", "必去"],
        "authentic": ["正宗", "地道", "authentic", "传统", "老店", "正宗", "原汁原味"]
    },
    "practical": {
        "parking": ["停车", "parking", "车位", "好停车", "plaza", "停车场"],
        "no-wait": ["不排队", "等位少", "不用等", "快", "直接进", "有位"],
        "takeout-friendly": ["外卖", "打包", "takeout", "to-go", "外带"],
        "late-night": ["深夜", "夜宵", "late", "开到晚", "24小时", "夜宵", "晚上"],
        "budget": ["便宜", "实惠", "划算", "性价比高", "$", "便宜", "低价", "人均低", "便宜"],
        "spicy": ["辣", "麻辣", "spicy", "重口味", "川味", "湘味"],
        "healthy": ["健康", "清淡", "healthy", "organic", "轻食", "少油", "营养"],
        "halal": ["清真", "halal", "穆斯林"]
    }
}

# 基于类型的默认标签
TYPE_DEFAULT_TAGS = {
    "湘菜": {"scenes": ["group-dining", "casual"], "vibes": ["lively", "authentic"], "practical": ["spicy"]},
    "川菜": {"scenes": ["group-dining", "casual"], "vibes": ["lively", "authentic"], "practical": ["spicy"]},
    "东北菜": {"scenes": ["group-dining", "family-friendly"], "vibes": ["cozy", "authentic"], "practical": ["budget"]},
    "火锅": {"scenes": ["group-dining", "date-night"], "vibes": ["lively", "cozy"], "practical": []},
    "日料": {"scenes": ["date-night", "business"], "vibes": ["fancy", "quiet"], "practical": []},
    "韩餐": {"scenes": ["group-dining", "casual"], "vibes": ["lively"], "practical": []},
    "上海菜": {"scenes": ["family-friendly", "business"], "vibes": ["cozy", "authentic"], "practical": []},
    "越南菜": {"scenes": ["casual", "date-night"], "vibes": ["cozy"], "practical": ["healthy", "budget"]},
    "新疆菜": {"scenes": ["group-dining"], "vibes": ["authentic", "lively"], "practical": []},
    "德餐": {"scenes": ["date-night", "group-dining"], "vibes": ["fancy", "lively"], "practical": []},
    "墨西哥菜": {"scenes": ["casual", "group-dining"], "vibes": ["lively"], "practical": ["budget"]},
    "麻辣烫": {"scenes": ["solo-dining", "casual"], "vibes": ["casual"], "practical": ["budget", "spicy"]},
    "东南亚菜": {"scenes": ["date-night", "casual"], "vibes": ["cozy"], "practical": ["spicy"]}
}

def extract_tags_from_text(text: str) -> Dict[str, List[str]]:
    """从文本中提取语义标签"""
    text_lower = text.lower()
    tags = {
        "scenes": [],
        "vibes": [],
        "practical": [],
        "keywords": []
    }
    
    for category, rules in SEMANTIC_RULES.items():
        for tag, keywords in rules.items():
            for keyword in keywords:
                if keyword in text_lower:
                    if tag not in tags[category]:
                        tags[category].append(tag)
                    if keyword not in tags["keywords"]:
                        tags["keywords"].append(keyword)
                    break
    
    return tags

def get_default_tags_for_type(food_type: str) -> Dict[str, List[str]]:
    """根据菜系类型获取默认标签"""
    return TYPE_DEFAULT_TAGS.get(food_type, {"scenes": [], "vibes": [], "practical": []})

def analyze_restaurant(restaurant: Dict) -> Dict:
    """分析单个餐厅，提取语义标签"""
    # 收集所有文本内容
    texts = []
    
    if "highlights" in restaurant:
        texts.extend(restaurant["highlights"])
    
    if "recommendations" in restaurant:
        texts.extend(restaurant["recommendations"])
    
    metrics = restaurant.get("metrics", {})
    sentiment = metrics.get("sentiment_analysis", {})
    quotes = sentiment.get("key_positive_quotes", [])
    texts.extend(quotes)
    
    if "correction" in restaurant:
        texts.append(restaurant["correction"])
    
    # 合并所有文本
    full_text = " ".join(texts)
    
    # 从文本提取标签
    extracted_tags = extract_tags_from_text(full_text)
    
    # 获取类型默认标签
    food_type = restaurant.get("type", "")
    default_tags = get_default_tags_for_type(food_type)
    
    # 合并标签（默认标签 + 提取标签）
    merged_tags = {
        "scenes": list(set(default_tags["scenes"] + extracted_tags["scenes"])),
        "vibes": list(set(default_tags["vibes"] + extracted_tags["vibes"])),
        "practical": list(set(default_tags["practical"] + extracted_tags["practical"])),
        "keywords": extracted_tags["keywords"]
    }
    
    # 基于价格添加标签
    price_range = restaurant.get("price_range", "")
    if price_range in ["$"]:
        if "budget" not in merged_tags["practical"]:
            merged_tags["practical"].append("budget")
    elif price_range in ["$$$", "$$$$"]:
        if "fancy" not in merged_tags["vibes"]:
            merged_tags["vibes"].append("fancy")
    
    # 基于区域推断
    area = restaurant.get("area", "")
    location = restaurant.get("location", "")
    
    # 构建可搜索文本
    searchable_parts = [
        restaurant.get("name", ""),
        restaurant.get("name_en", ""),
        food_type,
        restaurant.get("cuisine", ""),
        area,
        location,
        " ".join(merged_tags["scenes"]),
        " ".join(merged_tags["vibes"]),
        " ".join(merged_tags["practical"]),
        full_text
    ]
    
    return {
        "semantic_tags": merged_tags,
        "searchable_text": " ".join(searchable_parts).lower()
    }

def process_database(input_path: str, output_path: str):
    """处理整个数据库"""
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    restaurants = data.get("restaurants", [])
    
    for restaurant in restaurants:
        analysis = analyze_restaurant(restaurant)
        restaurant["semantic_tags"] = analysis["semantic_tags"]
        restaurant["searchable_text"] = analysis["searchable_text"]
    
    # 添加统计信息
    all_scenes = set()
    all_vibes = set()
    all_practical = set()
    
    for r in restaurants:
        tags = r.get("semantic_tags", {})
        all_scenes.update(tags.get("scenes", []))
        all_vibes.update(tags.get("vibes", []))
        all_practical.update(tags.get("practical", []))
    
    data["semantic_index"] = {
        "available_scenes": sorted(list(all_scenes)),
        "available_vibes": sorted(list(all_vibes)),
        "available_practical": sorted(list(all_practical)),
        "total_indexed": len(restaurants)
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 语义索引完成！")
    print(f"   - 场景标签: {len(all_scenes)} 个")
    print(f"     {sorted(all_scenes)}")
    print(f"   - 氛围标签: {len(all_vibes)} 个")
    print(f"     {sorted(all_vibes)}")
    print(f"   - 实用标签: {len(all_practical)} 个")
    print(f"     {sorted(all_practical)}")
    print(f"   - 已索引餐厅: {len(restaurants)}")
    
    # 打印示例
    print(f"\n📍 示例标签:")
    for r in restaurants[:3]:
        tags = r.get("semantic_tags", {})
        print(f"   {r['name']}: {tags}")

if __name__ == "__main__":
    import sys
    
    input_file = sys.argv[1] if len(sys.argv) > 1 else "data/current/restaurant_database.json"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "data/current/restaurant_database.json"
    
    process_database(input_file, output_file)
