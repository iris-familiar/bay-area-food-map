#!/usr/bin/env python3
"""
数据处理Pipeline - 清洗、标准化、去重、验证
"""
import json
import re

INPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v8.json'
OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_clean.json'

# 名称标准化映射
NAME_NORMALIZATION = {
    # 合并变体
    '小聚': '留湘小聚',
    '留湘小聚cupertino': '留湘小聚',
    '留湘': '留湘小聚',
    'chongqingxiaomian': '重庆铺盖面',
    '重庆铺盖面': '重庆铺盖面',
    '金戈戈豉油鸡': '金戈戈',
    '金戈戈': '金戈戈',
    '林家万峦猪脚': '万峦猪脚',
    '万峦猪脚': '万峦猪脚',
    '鲜味水饺': '鲜味水饺',
    '一品香饺子': '一品香饺子',
    'epicdumpling': '一品香饺子',
    '一品香': '一品香饺子',
    '李与白包子铺': '李与白',
    '李与白': '李与白',
}

# 需要删除的可疑条目
BLOCKED_NAMES = [
    '面面俱到',  # 可能是描述而非餐厅名
    '半岛', '餐厅', '美食坊', '美食', '饭店',
    'mountainview', 'sunnyvale', 'fremont', 'milpitas', 'cupertino',
    'sanfrancisco', 'paloalto', 'sanmateo', 'oakland', 'berkeley',
    'newark', 'unioncity', 'hayward', 'dublin', 'pleasanton',
    '山野森林系贵州餐厅',  # 描述性
]

def normalize_name(name):
    """标准化餐厅名"""
    key = name.lower().replace(' ', '').replace("'", '').replace('-', '')
    return NAME_NORMALIZATION.get(key, name)

def is_blocked(name):
    """检查是否为需要过滤的条目"""
    key = name.lower().replace(' ', '')
    for blocked in BLOCKED_NAMES:
        if blocked.lower() in key or key == blocked.lower():
            return True
    return False

def merge_restaurants(restaurants):
    """合并同名餐厅"""
    merged = {}
    
    for r in restaurants:
        name = normalize_name(r['name'])
        
        if is_blocked(name):
            continue
        
        key = name.lower().replace(' ', '')
        
        if key not in merged:
            merged[key] = {
                'id': r['id'],
                'name': name,
                'name_en': r.get('name_en', ''),
                'cuisine': r.get('cuisine', ''),
                'area': r.get('area', ''),
                'price_range': r.get('price_range', ''),
                'total_engagement': r.get('total_engagement', 0),
                'mention_count': r.get('mention_count', 0),
                'sources': list(set(r.get('sources', []))),
                'recommendations': list(set(r.get('recommendations', []))),
                'post_details': r.get('post_details', [])
            }
        else:
            # 合并数据
            m = merged[key]
            m['total_engagement'] += r.get('total_engagement', 0)
            m['mention_count'] += r.get('mention_count', 0)
            m['sources'] = list(set(m['sources'] + r.get('sources', [])))
            m['recommendations'] = list(set(m['recommendations'] + r.get('recommendations', [])))
            m['post_details'] = m['post_details'] + r.get('post_details', [])
            
            # 选择最完整的菜系和地区
            if not m['cuisine'] and r.get('cuisine'):
                m['cuisine'] = r['cuisine']
            if not m['area'] and r.get('area'):
                m['area'] = r['area']
    
    return list(merged.values())

def validate_restaurant(r):
    """验证餐厅数据"""
    issues = []
    
    # 检查必要字段
    if not r['name'] or len(r['name']) < 2:
        issues.append('名称太短')
    
    # 检查描述性名称
    if r['name'] in ['美食', '餐厅', '好吃的', '推荐']:
        issues.append('描述性名称')
    
    # 检查engagement
    if r['total_engagement'] == 0:
        issues.append('无互动数据')
    
    # 检查source
    if not r.get('sources'):
        issues.append('无来源')
    
    return issues

def clean_cuisine(cuisine):
    """清洗菜系名称"""
    if not cuisine:
        return None
    
    # 标准化菜系名
    cuisine_map = {
        '中餐': '中餐',
        '湘菜': '湘菜',
        '川菜': '川菜',
        '粤菜': '粤菜',
        '上海菜': '上海菜',
        '江浙菜': '江浙菜',
        '东北菜': '东北菜',
        '北京菜': '北京菜',
        '日料': '日料',
        '韩餐': '韩餐',
        '泰国菜': '泰国菜',
        '越南菜': '越南菜',
        '火锅': '火锅',
        '烧烤': '烧烤',
        '面食': '面食',
        '饺子': '饺子',
        '包子': '包子',
        '海鲜': '海鲜',
        '融合菜': '融合菜',
        '云南菜': '云南菜',
        '贵州菜': '贵州菜',
        '新疆菜': '新疆菜',
        '台湾菜': '台湾菜',
        '潮汕菜': '潮汕菜',
        '徽菜': '徽菜',
        '墨西哥菜': '墨西哥菜',
    }
    
    for key, value in cuisine_map.items():
        if key in cuisine:
            return value
    
    return cuisine

def clean_area(area):
    """清洗地区名称"""
    if not area:
        return None
    
    # 标准化地区名
    area_map = {
        'cupertino': 'Cupertino',
        'sunnyvale': 'Sunnyvale',
        'milpitas': 'Milpitas',
        'fremont': 'Fremont',
        'mountainview': 'Mountain View',
        'mtv': 'Mountain View',
        'paloalto': 'Palo Alto',
        'sanjose': 'San Jose',
        'santaclara': 'Santa Clara',
        'newark': 'Newark',
        'unioncity': 'Union City',
        'hayward': 'Hayward',
    }
    
    key = area.lower().replace(' ', '')
    return area_map.get(key, area)

def main():
    print('🔄 数据处理Pipeline')
    print('=' * 70)
    
    # 读取数据
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    restaurants = data['restaurants']
    print(f'原始餐厅数: {len(restaurants)}')
    
    # 1. 合并同名餐厅
    merged = merge_restaurants(restaurants)
    print(f'合并后: {len(merged)} 家')
    
    # 2. 清洗菜系和地区
    for r in merged:
        r['cuisine'] = clean_cuisine(r.get('cuisine'))
        r['area'] = clean_area(r.get('area'))
    
    # 3. 验证
    valid_restaurants = []
    rejected = []
    for r in merged:
        issues = validate_restaurant(r)
        if issues:
            rejected.append({
                'name': r['name'],
                'issues': issues,
                'engagement': r['total_engagement']
            })
        else:
            valid_restaurants.append(r)
    
    print(f'验证通过: {len(valid_restaurants)} 家')
    print(f'被拒绝: {len(rejected)} 家')
    
    if rejected:
        print('\n被拒绝的条目:')
        for r in rejected[:10]:
            print(f"  - {r['name']}: {', '.join(r['issues'])}")
    
    # 4. 重新编号和排序
    valid_restaurants.sort(key=lambda x: x['total_engagement'], reverse=True)
    for i, r in enumerate(valid_restaurants, 1):
        r['id'] = f'r{i:03d}'
    
    # 5. 保存
    output = {
        'version': '8.1-clean',
        'total_restaurants': len(valid_restaurants),
        'processing_steps': [
            'name_normalization',
            'duplicate_merge',
            'cuisine_standardization',
            'area_standardization',
            'validation'
        ],
        'restaurants': valid_restaurants
    }
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f'\n✅ 清洗后数据已保存到: {OUTPUT_FILE}')
    
    # 显示Top 20
    print('\nTop 20 餐厅:')
    for i, r in enumerate(valid_restaurants[:20], 1):
        area = r.get('area') or '?'
        cuisine = r.get('cuisine') or '?'
        print(f"{i:2d}. {r['name']:25s} | {cuisine:10s} | {area:15s} | {r['total_engagement']:5d}")
    
    return valid_restaurants

if __name__ == '__main__':
    main()
