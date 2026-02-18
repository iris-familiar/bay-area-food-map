#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI-Powered restaurant extraction from 82 Xiaohongshu posts
"""

import json
import os
import glob
import re
from datetime import datetime

def get_all_post_files(directory):
    return sorted(glob.glob(os.path.join(directory, "*.json")))

def extract_post_data(file_path):
    """从json文件中提取post数据"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        content_list = data.get('result', {}).get('content', [])
        if not content_list:
            return None
            
        inner_text = content_list[0].get('text', '{}')
        inner_data = json.loads(inner_text)
        
        note = inner_data.get('data', {}).get('note', {})
        comments_data = inner_data.get('data', {}).get('comments', {})
        comments = comments_data.get('list', []) if comments_data else []
        
        post_id = note.get('noteId', '')
        title = note.get('title', '')
        desc = note.get('desc', '')
        time_ms = note.get('time', 0)
        
        post_date = datetime.fromtimestamp(time_ms / 1000).strftime('%Y-%m-%d') if time_ms else ''
        
        interact = note.get('interactInfo', {})
        liked_count = int(interact.get('likedCount', '0') or '0')
        comment_count = int(interact.get('commentCount', '0') or '0')
        collected_count = int(interact.get('collectedCount', '0') or '0')
        total_engagement = liked_count + comment_count + collected_count
        
        # 提取评论文本
        comments_text = []
        for c in comments:
            comments_text.append(c.get('content', ''))
            for sub in c.get('subComments', []):
                if sub:
                    comments_text.append(sub.get('content', ''))
        
        return {
            'post_id': post_id,
            'title': title,
            'desc': desc,
            'date': post_date,
            'engagement': total_engagement,
            'liked_count': liked_count,
            'comment_count': comment_count,
            'collected_count': collected_count,
            'comments': comments_text,
            'file': os.path.basename(file_path)
        }
    except Exception as e:
        return None

# 已知餐厅名称映射（用于识别常见餐厅）
KNOWN_RESTAURANTS = {
    # 中文名: (英文名, 菜系, 地区)
    '留湘小聚': ('Liuxiang Xiaoju', '湘菜', 'Cupertino'),
    '韶山印象': ('Shaoshan Impression', '湘菜', 'Cupertino'),
    '沪鼎记': ('Hu Ding Ji', '上海菜', 'Cupertino'),
    '一品香饺子': ('Epic Dumpling', '饺子', 'Sunnyvale'),
    '花溪王': ('Huaxi Wang', '贵州菜', 'Mountain View'),
    '重庆铺盖面': ('Chongqing Pugai Noodles', '川菜', 'Cupertino'),
    '鱼你在一起': ("Wei's Fish", '川菜', ''),
    'Mala Town': ('', '麻辣烫', ''),
    '小刘清粥': ('Liu Qingzhou', '台湾菜', ''),
    'Hunan House': ('', '湘菜', ''),
    'Jun Bistro': ('', '融合菜', ''),
    '外婆家常菜': ("Grandma's Kitchen", '家常菜', ''),
    '汉家宴': ('Home Eat', '中餐', ''),
    '丁香砂锅馆': ('Sizzling Pot House', '砂锅', ''),
    '汆悦麻辣烫': ('', '麻辣烫', ''),
}

# 地区关键词
AREA_KEYWORDS = {
    'Cupertino': ['cupertino'],
    'Sunnyvale': ['sunnyvale'],
    'Fremont': ['fremont'],
    'San Jose': ['san jose', 'sj'],
    'Mountain View': ['mountain view', 'mtv'],
    'Palo Alto': ['palo alto'],
    'Milpitas': ['milpitas'],
    'Santa Clara': ['santa clara'],
    'Newark': ['newark'],
    'Union City': ['union city'],
    '东湾': ['东湾', 'fremont', 'newark', 'union city'],
    '南湾': ['南湾', 'cupertino', 'sunnyvale', 'sanjose', 'milpitas', 'santa clara'],
}

def detect_area(text):
    """检测地区"""
    text_lower = text.lower()
    for area, keywords in AREA_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return area
    return ''

def detect_cuisine(text):
    """检测菜系"""
    cuisine_keywords = {
        '川菜': ['川菜', '四川', '麻辣', '火锅', '麻辣烫', '沸腾鱼', '水煮'],
        '湘菜': ['湘菜', '湖南', '韶山', '剁椒', '小炒肉'],
        '粤菜': ['粤菜', '广东', '早茶', '点心', '烧腊'],
        '江浙菜': ['江浙菜', '江浙', '上海菜', '杭帮菜', '淮扬菜'],
        '东北菜': ['东北菜', '东北', '铁锅炖', '锅包肉'],
        '北京菜': ['北京菜', '北京', '烤鸭', '炸酱面'],
        '云南菜': ['云南菜', '云南', '米线', '滇菜'],
        '贵州菜': ['贵州', '贵州菜', '花溪'],
        '台湾菜': ['台湾菜', '台湾', '卤肉饭', '牛肉面'],
        '日料': ['日料', '日本料理', '寿司', '拉面', '刺身'],
        '韩餐': ['韩餐', '韩国料理', '烤肉', '韩式', 'korean'],
        '泰国菜': ['泰国菜', '泰式', '泰国', 'thai'],
        '越南菜': ['越南菜', '越南', '越南粉', 'pho'],
        '印度菜': ['印度菜', '印度', '咖喱', 'indian'],
        '烧烤': ['烧烤', '烤肉', 'bbq'],
        '火锅': ['火锅', 'hot pot'],
        '饺子': ['饺子', '水饺', '蒸饺'],
        '面馆': ['面馆', '面条', '拉面', '牛肉面'],
        '早茶': ['早茶', '点心', '茶餐厅'],
    }
    
    for cuisine, keywords in cuisine_keywords.items():
        for kw in keywords:
            if kw in text:
                return cuisine
    return ''

def extract_restaurant_name(text, line):
    """智能提取餐厅名称"""
    # 去掉表情符号
    clean = re.sub(r'\[.*?\]', '', line)
    clean = clean.strip()
    
    # 模式1: 直接是餐厅名
    # 去掉数字前缀
    clean = re.sub(r'^\d+[.、\s]*', '', clean)
    
    # 去掉常见前缀/后缀
    for prefix in ['打卡', '推荐', '尝试', '发现', '今天', '这家', '那家']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
    
    # 取第一行或第一部分
    name = clean.split('\n')[0].split('，')[0].split('。')[0]
    name = name.split('（')[0].split('(')[0]
    name = name.strip()
    
    # 过滤
    if len(name) < 2 or len(name) > 30:
        return None
    
    # 排除明显不是餐厅名的
    exclude_patterns = [
        r'^\d+$',  # 纯数字
        r'^[\s\d,.:]+$',  # 纯标点和数字
        r'^#',  # 话题
        r'话题',  # 包含话题
        r'^湾区$', r'^美国$', r'^南湾$', r'^东湾$',
        r'^推荐$', r'^好吃$', r'^打卡$',
    ]
    
    for pattern in exclude_patterns:
        if re.search(pattern, name):
            return None
    
    # 排除菜品名
    dish_keywords = ['水饺', '面条', '炒饭', '炒面', '牛肉', '猪肉', '鸡肉', '鱼香', '宫保',
                     '饺子', '包子', '馒头', '煎饼', '肉夹馍', '凉皮', '凉粉', '豆腐']
    # 但如果名字较长，可能是餐厅名
    if len(name) <= 4:
        for kw in dish_keywords:
            if name.endswith(kw):
                return None
    
    return name

def process_all_posts(posts_dir, output_file):
    """处理所有post文件"""
    files = get_all_post_files(posts_dir)
    print(f"Processing {len(files)} files...\n")
    
    all_restaurants = {}
    restaurant_counter = 1
    processed_count = 0
    
    for i, file_path in enumerate(files):
        post_data = extract_post_data(file_path)
        if not post_data:
            continue
        
        processed_count += 1
        desc = post_data['desc']
        title = post_data['title']
        full_text = title + '\n' + desc
        
        # 提取数字列表项
        lines = desc.split('\n')
        found_restaurants = []
        
        for line in lines:
            # 匹配数字列表
            if re.match(r'^(?:\d+[.、\s]+|[①②③④⑤⑥⑦⑧⑨⑩])', line.strip()):
                name = extract_restaurant_name(full_text, line)
                if name:
                    found_restaurants.append(name)
        
        # 从标题提取（如果没有从desc中提取到）
        if not found_restaurants:
            # 尝试从标题提取餐厅名
            title_clean = re.sub(r'#.*?[\s$]', '', title)
            # 提取中文名称
            cn_names = re.findall(r'([\u4e00-\u9fa5]{2,8}(?:餐厅|面馆|火锅|烧烤|日料|饺子))', title_clean)
            found_restaurants.extend(cn_names)
        
        if found_restaurants:
            print(f"[{processed_count}] {post_data['title'][:50]}...")
            print(f"    Engagement: {post_data['engagement']}")
            
            for name in found_restaurants:
                print(f"    -> {name}")
                
                key = name.lower().replace(' ', '')
                
                if key not in all_restaurants:
                    # 检测地区和菜系
                    area = detect_area(full_text) or detect_area(name)
                    cuisine = detect_cuisine(full_text) or detect_cuisine(name)
                    
                    # 检查已知餐厅映射
                    name_en = ''
                    for known_cn, (known_en, known_cuisine, known_area) in KNOWN_RESTAURANTS.items():
                        if known_cn in name:
                            name_en = known_en
                            if not cuisine and known_cuisine:
                                cuisine = known_cuisine
                            if not area and known_area:
                                area = known_area
                            break
                    
                    all_restaurants[key] = {
                        'id': f'r{restaurant_counter:03d}',
                        'name': name,
                        'name_en': name_en,
                        'cuisine': cuisine,
                        'area': area,
                        'price_range': '',
                        'total_engagement': 0,
                        'mention_count': 0,
                        'sources': [],
                        'recommendations': [],
                        'post_details': []
                    }
                    restaurant_counter += 1
                
                rest = all_restaurants[key]
                rest['total_engagement'] += post_data['engagement']
                rest['mention_count'] += 1
                if post_data['post_id'] not in rest['sources']:
                    rest['sources'].append(post_data['post_id'])
                rest['post_details'].append({
                    'post_id': post_data['post_id'],
                    'title': post_data['title'],
                    'date': post_data['date'],
                    'engagement': post_data['engagement'],
                    'context': name[:200]
                })
    
    # 保存结果
    sorted_restaurants = sorted(
        all_restaurants.values(), 
        key=lambda x: x['total_engagement'], 
        reverse=True
    )
    
    result = {
        'restaurants': sorted_restaurants,
        'meta': {
            'total_restaurants': len(all_restaurants),
            'processed_posts': processed_count,
            'status': 'completed'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"✅ Extracted {len(all_restaurants)} restaurants")
    print(f"✅ From {processed_count} posts")
    print(f"✅ Saved to {output_file}")
    print(f"{'='*60}")
    
    # 打印统计
    print(f"\nTop 15 restaurants by engagement:")
    for r in sorted_restaurants[:15]:
        area_str = f" [{r['area']}]" if r['area'] else ''
        cuisine_str = f" ({r['cuisine']})" if r['cuisine'] else ''
        print(f"  {r['name']}{area_str}{cuisine_str} - {r['total_engagement']} engagement")

if __name__ == '__main__':
    POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'
    OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json'
    
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    process_all_posts(POSTS_DIR, OUTPUT_FILE)
