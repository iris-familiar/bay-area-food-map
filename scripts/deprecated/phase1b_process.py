#!/usr/bin/env python3
"""
Phase 1B: 数据解析、去重与入库
"""

import json
import re
from pathlib import Path
from datetime import datetime

# Phase 1A 发现的餐厅（人工整理，从帖子标题提取）
PHASE1A_RESTAURANTS = [
    # Cupertino
    {"name": "留湘", "name_en": "Hunan House", "city": "Cupertino", "cuisine": "湘菜", "notes": "米其林推荐", "source_title": "湾区网红美食测评 ｜米一 ｜留湘"},
    {"name": "肖婆婆砂锅", "name_en": "XPP Claypot", "city": "Cupertino", "cuisine": "川菜", "notes": "新开业川式砂锅", "source_title": "Cupertino 新开｜正宗川式砂锅"},
    {"name": "湘粤情", "name_en": "Jade Xiang Yue", "city": "Cupertino", "cuisine": "湘菜/粤菜", "notes": "", "source_title": "湘粤情 是舒服的好吃"},
    {"name": "重庆荣昌铺盖面", "name_en": "Chongqing Noodles", "city": "Cupertino", "cuisine": "川菜/面食", "notes": "成都人四刷推荐", "source_title": "成都人四刷Cupertino重庆铺盖面"},
    
    # Fremont
    {"name": "沸腾鱼", "name_en": "Sizzling Fish", "city": "Fremont", "cuisine": "川菜", "notes": "湾区最正宗沸腾鱼", "source_title": "降温了！来Fremont吃湾区最正宗沸腾鱼"},
    {"name": "上海餐馆", "name_en": "Shanghai Restaurant", "city": "Fremont", "cuisine": "上海菜", "notes": "", "source_title": "湾区🥢 我心中最Top级上海餐馆"},
    {"name": "潮汕砂锅粥", "name_en": "Chaoshan Claypot Porridge", "city": "Fremont", "cuisine": "粤菜/潮汕菜", "notes": "正宗潮汕砂锅粥", "source_title": "老广泪目了！湾区有正宗精致潮汕砂锅粥了"},
    {"name": "One Piece Lamian", "name_en": "One Piece Lamian", "city": "Fremont", "cuisine": "西北菜/拉面", "notes": "羊杂汤", "source_title": "湾区fremont神仙羊杂汤 one piece lamian"},
    {"name": "徽菜馆", "name_en": "Anhui Cuisine", "city": "Fremont", "cuisine": "徽菜", "notes": "", "source_title": "跟着小红书吃湾区｜我们徽京人也来试试徽菜"},
    
    # Milpitas
    {"name": "万峦猪脚", "name_en": "Wanluan Pork Knuckle", "city": "Milpitas", "cuisine": "台湾菜", "notes": "台湾风味", "source_title": "湾区超好吃的万峦猪脚和麻油鸡"},
    {"name": "江南雅厨", "name_en": "Jiangnan Ya Chu", "city": "Milpitas", "cuisine": "苏州菜", "notes": "黑珍珠苏州菜", "source_title": "南湾｜特来品尝来自国内的黑珍珠苏州菜"},
    {"name": "山城私房菜", "name_en": "Mountain City Private Kitchen", "city": "Milpitas", "cuisine": "川菜", "notes": "", "source_title": "这次去吃的是山城私房菜"},
    {"name": "牛浪人", "name_en": "Niu Lang Ren", "city": "Milpitas", "cuisine": "日料/和牛寿司", "notes": "和牛寿司自助", "source_title": "Milpitas 牛浪人和牛寿司自助测评附菜单"},
    {"name": "Yuan Bistro", "name_en": "Yuan Bistro", "city": "Milpitas", "cuisine": "东北菜", "notes": "东北菜", "source_title": "Yuan Bistro｜南方人已被东北菜份量吓晕"},
    {"name": "家常菜馆", "name_en": "Home Style Cooking", "city": "Milpitas", "cuisine": "中餐", "notes": "已三刷", "source_title": "湾区Milpitas好吃的家常菜推荐！已三刷！"},
    
    # Mountain View
    {"name": "花溪王", "name_en": "Hua Xi Wang", "city": "Mountain View", "cuisine": "贵州菜", "notes": "贵州菜，猪蹄好吃", "source_title": "湾区竟然有这么一个山野森林系贵州餐厅"},
    {"name": "包大人", "name_en": "Bao Da Ren", "city": "Mountain View", "cuisine": "中餐", "notes": "MTV downtown", "source_title": "湾区探店之二刷MTV downtown包大人"},
    {"name": "MTV川湘家常菜", "name_en": "MTV Sichuan Hunan Home Style", "city": "Mountain View", "cuisine": "川湘菜", "notes": "", "source_title": "MTV新晋川湘家常菜"},
    {"name": "MTV泰餐小馆", "name_en": "MTV Thai Bistro", "city": "Mountain View", "cuisine": "泰国菜", "notes": "", "source_title": "湾区｜MTV这家泰餐小馆太惊喜"},
    {"name": "新疆拉条子", "name_en": "Xinjiang Lamian", "city": "Mountain View", "cuisine": "新疆菜", "notes": "新疆面食", "source_title": "新疆美食❗️被平平无奇的新疆拉条子惊艳了"},
    {"name": "云贵菜馆", "name_en": "Yungui Cuisine", "city": "Mountain View", "cuisine": "云贵菜", "notes": "烧椒菜", "source_title": "儿童超级友好的云贵菜"},
    {"name": "湾区第一牛肉面", "name_en": "Best Beef Noodles", "city": "Mountain View", "cuisine": "中餐/面食", "notes": "牛肉面+水饺", "source_title": "湾区第一牛肉面和水饺"},
    
    # Sunnyvale
    {"name": "包子铺", "name_en": "Bao Zi Shop", "city": "Sunnyvale", "cuisine": "中餐/早点", "notes": "现做现蒸", "source_title": "Sunnyvale现做现蒸的包子铺开门啦"},
    {"name": "淮扬菜餐厅", "name_en": "Huaiyang Cuisine", "city": "Sunnyvale", "cuisine": "淮扬菜", "notes": "新派淮扬菜", "source_title": "湾区探店｜漂漂亮亮的新派淮扬菜新餐厅"},
    {"name": "上海家常菜", "name_en": "Shanghai Home Style", "city": "Sunnyvale", "cuisine": "上海菜", "notes": "平价上海菜", "source_title": "冬天一口暖暖的Sunnyvale平价上海家常味"},
    {"name": "李与白", "name_en": "Li Yu Bai", "city": "Sunnyvale", "cuisine": "中餐", "notes": "", "source_title": "湾区|李与白好吃"},
    {"name": "汆悦麻辣烫", "name_en": "Cuan Yue Malatang", "city": "Sunnyvale", "cuisine": "麻辣烫", "notes": "新开业", "source_title": "湾区新店|汆悦麻辣烫"},
    {"name": "Wakusei拉面", "name_en": "Wakusei Ramen", "city": "Sunnyvale", "cuisine": "日料/拉面", "notes": "高价拉面", "source_title": "湾区最贵拉面🍜Wakusei替大家交学费了"},
    {"name": "蒸饭专门店", "name_en": "Steamed Rice Shop", "city": "Sunnyvale", "cuisine": "中餐", "notes": "", "source_title": "被Sunnyvale这家蒸饭惊艳了"},
    {"name": "黄鱼年糕", "name_en": "Yellow Fish Rice Cake", "city": "Sunnyvale", "cuisine": "江浙菜", "notes": "家烧黄鱼手打年糕", "source_title": "南湾｜在湾区也吃到了那口家烧黄鱼手打年糕"},
]

def normalize_name(name):
    """标准化餐厅名称用于去重"""
    name = name.lower().strip()
    # 移除常见后缀
    name = re.sub(r'(restaurant|cuisine|kitchen|house|bistro)$', '', name).strip()
    return name

def check_duplicate(new_restaurant, existing_restaurants):
    """检查是否重复"""
    new_name = normalize_name(new_restaurant['name'])
    new_name_en = normalize_name(new_restaurant.get('name_en', ''))
    
    for existing in existing_restaurants:
        # 检查中文名
        if normalize_name(existing['name']) == new_name:
            return True
        # 检查英文名
        if new_name_en and normalize_name(existing.get('name_en', '')) == new_name_en:
            return True
    return False

def generate_id(index):
    """生成餐厅ID"""
    return f"r{index:03d}"

def create_restaurant_entry(restaurant, index):
    """创建标准格式的餐厅条目"""
    return {
        "id": generate_id(index),
        "name": restaurant['name'],
        "name_en": restaurant['name_en'],
        "type": restaurant['cuisine'],
        "cuisine": restaurant['cuisine'],
        "area": restaurant['city'],
        "location": restaurant['city'],
        "address": f"{restaurant['city']}, CA (待验证)",
        "price_range": "$$",
        "status": "discovered",
        "verified": False,
        "google_place_id": None,
        "google_rating": None,
        "google_price_level": None,
        "metrics": {
            "discussion_volume": {
                "total_posts": 1,
                "total_comments": 0,
                "total_engagement": 1,
                "mention_count": 1,
                "last_mentioned": datetime.now().strftime('%Y-%m-%d'),
                "trend": "new"
            },
            "sentiment_analysis": {
                "overall": "positive",
                "score": 0.75,
                "positive_mentions": 1,
                "neutral_mentions": 0,
                "negative_mentions": 0,
                "key_positive_quotes": [restaurant['notes']] if restaurant['notes'] else [],
                "key_negative_quotes": [],
                "confidence": "medium"
            },
            "trend_over_time": {
                "trend_direction": "new",
                "trend_percentage": 0,
                "peak_discussion_date": datetime.now().strftime('%Y-%m-%d'),
                "first_mentioned": datetime.now().strftime('%Y-%m-%d')
            }
        },
        "sources": ["xiaohongshu_search"],
        "recommendations": [],
        "highlights": [restaurant['cuisine']],
        "notes": restaurant['notes'],
        "source_title": restaurant['source_title'],
        "semantic_tags": {
            "scenes": ["dining"],
            "vibes": ["authentic"],
            "practical": [],
            "keywords": [restaurant['cuisine']]
        },
        "searchable_text": f"{restaurant['name']} {restaurant['name_en']} {restaurant['cuisine']} {restaurant['city']} {restaurant['notes']}",
        "coordinates": None,
        "embedding": None
    }

def main():
    # 读取现有数据库
    db_path = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json')
    with open(db_path, 'r') as f:
        existing_db = json.load(f)
    
    existing_restaurants = existing_db['restaurants']
    existing_count = len(existing_restaurants)
    print(f"📚 现有餐厅数量: {existing_count}")
    
    # 去重检查并添加新餐厅
    new_restaurants = []
    duplicates = []
    
    for restaurant in PHASE1A_RESTAURANTS:
        if check_duplicate(restaurant, existing_restaurants + new_restaurants):
            duplicates.append(restaurant['name'])
            print(f"  ⚠️ 重复: {restaurant['name']}")
        else:
            new_restaurants.append(restaurant)
    
    print(f"\n📊 去重结果:")
    print(f"  - Phase 1A 发现: {len(PHASE1A_RESTAURANTS)}")
    print(f"  - 重复数量: {len(duplicates)}")
    print(f"  - 新增数量: {len(new_restaurants)}")
    
    # 创建新餐厅条目
    new_entries = []
    for i, restaurant in enumerate(new_restaurants, start=existing_count + 1):
        entry = create_restaurant_entry(restaurant, i)
        new_entries.append(entry)
    
    # 合并数据库
    merged_restaurants = existing_restaurants + new_entries
    
    # 更新统计信息
    total_positive = sum(1 for r in merged_restaurants if r['metrics']['sentiment_analysis']['overall'] == 'positive')
    
    merged_db = {
        "version": "3.1-with-phase1a",
        "updated_at": datetime.now().strftime('%Y-%m-%d'),
        "validation_status": "Phase 1A completed - 30 new restaurants discovered",
        "total_restaurants": len(merged_restaurants),
        "statistics": {
            "original_count": existing_count,
            "new_from_phase1a": len(new_entries),
            "duplicates_removed": len(duplicates),
            "cities_covered": list(set(r['area'] for r in merged_restaurants)),
            "cuisine_types": list(set(r['cuisine'] for r in merged_restaurants)),
            "positive_sentiment_ratio": round(total_positive / len(merged_restaurants), 2)
        },
        "restaurants": merged_restaurants
    }
    
    # 保存合并后的数据库
    output_path = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v3.1.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(merged_db, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 合并后数据库已保存: {output_path}")
    print(f"   总餐厅数: {len(merged_restaurants)}")
    
    # 生成新增餐厅摘要
    print(f"\n🍴 新增餐厅列表 ({len(new_entries)}家):")
    for entry in new_entries:
        print(f"  • {entry['name']} ({entry['name_en']}) - {entry['cuisine']} - {entry['area']}")
    
    # 保存新增餐厅明细
    new_restaurants_path = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/phase1b_new_restaurants.json')
    with open(new_restaurants_path, 'w', encoding='utf-8') as f:
        json.dump({
            'phase': '1B',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'total_new': len(new_entries),
            'duplicates': duplicates,
            'new_restaurants': new_entries
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 新增餐厅明细已保存: {new_restaurants_path}")
    
    return merged_db

if __name__ == '__main__':
    main()
