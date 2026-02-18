#!/usr/bin/env python3
"""
小红书湾区餐厅数据解析脚本
Phase 1: 从搜索结果中提取餐厅信息
"""

import json
import os
import re
from pathlib import Path

# 亚洲菜系关键词
ASIAN_CUISINE_KEYWORDS = [
    # 中餐
    '中餐', '川菜', '湘菜', '粤菜', '淮扬菜', '江浙菜', '上海菜', '北京菜', '东北菜',
    '云南菜', '贵州菜', '新疆菜', '西北菜', '台湾菜', '香港菜', '早点', '早茶', '点心',
    '火锅', '烧烤', '麻辣烫', '砂锅', '包子', '面条', '饺子', '馄饨', '米线', '米粉',
    '拉面', '盖面', '煲仔饭', '烧腊', '茶餐厅', '湘', '川', '粤', '鲁', '苏', '浙', '闽', '徽',
    # 日料
    '日料', '日本料理', '寿司', '拉面', '刺身', '居酒屋', '烧鸟', '和牛',
    # 韩餐
    '韩餐', '韩国料理', '烤肉', '炸鸡', '部队锅', '石锅拌饭',
    # 东南亚
    '泰国菜', '泰餐', '越南菜', '越南粉', '新加坡菜', '马来西亚菜', '印尼菜', '东南亚',
    # 其他亚洲
    '印度菜', '尼泊尔菜', '蒙古菜', '缅甸菜', '老挝菜', '柬埔寨菜',
]

# 非亚洲菜系（排除）
NON_ASIAN_CUISINE_KEYWORDS = [
    '意大利', '法餐', '法国', '墨西哥', '美式', '汉堡', '披萨', '牛排', '西餐',
    '西班牙', '德国', '英国', '希腊', '地中海', '俄罗斯', '巴西', '阿根廷',
    '秘鲁', '古巴', '牙买加', '非洲', '中东', '土耳其', '伊朗', '阿拉伯',
    '肯德基', '麦当劳', '星巴克', '快餐', '快餐店'
]

# 湾区地标验证
BAY_AREA_KEYWORDS = [
    '湾区', 'Cupertino', 'Fremont', 'Milpitas', 'Mountain View', 'Sunnyvale',
    'San Jose', 'Santa Clara', 'Palo Alto', 'Los Altos', 'Saratoga',
    'Campbell', 'Los Gatos', 'Union City', 'Newark', 'Hayward',
    '南湾', '东湾', '半岛', '硅谷', '加州', 'California', 'CA'
]

def extract_restaurants_from_post(title, display_title=None):
    """从帖子标题中提取餐厅候选"""
    text = display_title if display_title else title
    if not text:
        return []
    
    restaurants = []
    
    # 模式1: XXX餐厅
    pattern1 = r'([^\s]{2,10})(?:餐厅|餐馆|饭店|食堂|小馆|菜馆)'
    matches1 = re.findall(pattern1, text)
    restaurants.extend(matches1)
    
    # 模式2: 餐厅名+|+其他描述
    pattern2 = r'^([^|【\s]{2,15})(?:\s*\||\s*【|\s*$)'
    matches2 = re.findall(pattern2, text)
    restaurants.extend(matches2)
    
    # 模式3: 湾区 XXX
    pattern3 = r'湾区[\s|｜]+([^【\s]{2,15})(?:\s|$|【)'
    matches3 = re.findall(pattern3, text)
    restaurants.extend(matches3)
    
    # 模式4: 推荐/吃/去 + 餐厅名
    pattern4 = r'(?:吃|去|探店|尝试|品尝)[了过到\s]*([^【\s]{2,12})(?:\s|$|【)'
    matches4 = re.findall(pattern4, text)
    restaurants.extend(matches4)
    
    # 清理并去重
    cleaned = []
    for r in restaurants:
        r = r.strip('【】[]()（）｜|')
        if len(r) >= 2 and r not in cleaned:
            cleaned.append(r)
    
    return cleaned

def is_asian_restaurant(text):
    """判断是否亚洲餐厅"""
    if not text:
        return False
    text_lower = text.lower()
    
    # 检查是否包含亚洲菜系关键词
    for keyword in ASIAN_CUISINE_KEYWORDS:
        if keyword in text:
            return True
    
    # 检查是否明确是非亚洲
    for keyword in NON_ASIAN_CUISINE_KEYWORDS:
        if keyword in text:
            return False
    
    return True  # 默认保留，后续人工审核

def is_bay_area(text):
    """验证是否在湾区"""
    if not text:
        return False
    for keyword in BAY_AREA_KEYWORDS:
        if keyword.lower() in text.lower():
            return True
    return False

def parse_search_result(file_path, city_name):
    """解析单个城市搜索结果"""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return []
    
    # 提取feeds
    try:
        feeds = data['result']['content'][0]['text']
        if isinstance(feeds, str):
            feeds = json.loads(feeds)
        feeds = feeds.get('feeds', [])
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print(f"Error parsing {file_path}: {e}")
        return []
    
    posts = []
    for feed in feeds:
        if feed.get('modelType') != 'note':
            continue
        
        note_card = feed.get('noteCard', {})
        display_title = note_card.get('displayTitle', '')
        
        # 跳过无标题的帖子
        if not display_title:
            continue
        
        # 互动数据
        interact_info = note_card.get('interactInfo', {})
        
        # 检查是否是亚洲餐厅相关内容
        if not is_asian_restaurant(display_title):
            continue
        
        # 检查湾区相关
        if not is_bay_area(display_title):
            continue
        
        post_data = {
            'id': feed.get('id'),
            'xsecToken': feed.get('xsecToken'),
            'title': display_title,
            'city': city_name,
            'likedCount': interact_info.get('likedCount', '0'),
            'sharedCount': interact_info.get('sharedCount', '0'),
            'commentCount': interact_info.get('commentCount', '0'),
            'collectedCount': interact_info.get('collectedCount', '0'),
            'restaurant_candidates': extract_restaurants_from_post(display_title)
        }
        posts.append(post_data)
    
    return posts

def main():
    # 数据目录
    data_dir = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw')
    
    # 城市文件映射
    cities = {
        'cupertino.json': 'Cupertino',
        'fremont.json': 'Fremont',
        'milpitas.json': 'Milpitas',
        'mountain_view.json': 'Mountain View',
        'sunnyvale.json': 'Sunnyvale'
    }
    
    all_posts = []
    city_stats = {}
    
    for filename, city_name in cities.items():
        file_path = data_dir / filename
        if not file_path.exists():
            print(f"File not found: {file_path}")
            continue
        
        posts = parse_search_result(file_path, city_name)
        all_posts.extend(posts)
        city_stats[city_name] = len(posts)
        print(f"✅ {city_name}: {len(posts)} 条有效帖子")
    
    # 汇总统计
    print(f"\n📊 Phase 1A 汇总:")
    print(f"- 总帖子数: {len(all_posts)}")
    for city, count in city_stats.items():
        print(f"  - {city}: {count} 条")
    
    # 提取所有餐厅候选
    all_restaurants = {}
    for post in all_posts:
        for restaurant in post['restaurant_candidates']:
            if restaurant not in all_restaurants:
                all_restaurants[restaurant] = {
                    'name': restaurant,
                    'mentions': [],
                    'cities': set()
                }
            all_restaurants[restaurant]['mentions'].append({
                'post_id': post['id'],
                'title': post['title'],
                'city': post['city'],
                'likedCount': post['likedCount']
            })
            all_restaurants[restaurant]['cities'].add(post['city'])
    
    # 转换为列表并排序（按提及次数）
    restaurant_list = []
    for name, data in all_restaurants.items():
        restaurant_list.append({
            'name': name,
            'mentions_count': len(data['mentions']),
            'cities': list(data['cities']),
            'mentions': data['mentions']
        })
    
    restaurant_list.sort(key=lambda x: x['mentions_count'], reverse=True)
    
    print(f"\n🍴 发现餐厅候选: {len(restaurant_list)} 家")
    print("\nTop 20 餐厅候选:")
    for i, r in enumerate(restaurant_list[:20], 1):
        print(f"  {i}. {r['name']} (提及{r['mentions_count']}次, 城市: {', '.join(r['cities'])})")
    
    # 保存结果
    output = {
        'phase': '1A',
        'search_date': '2026-02-15',
        'total_posts': len(all_posts),
        'total_restaurant_candidates': len(restaurant_list),
        'city_stats': city_stats,
        'posts': all_posts,
        'restaurant_candidates': restaurant_list
    }
    
    output_file = data_dir / 'phase1a_search_results.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 数据已保存: {output_file}")
    
    return output

if __name__ == '__main__':
    main()
