#!/usr/bin/env python3
"""
智能地址验证方案 - 结合多种数据源
"""

import json
from pathlib import Path

# 基于小红书帖子内容提取的地址线索
ADDRESS_CLUES = {
    # 从帖子标题/内容中提取的地址线索
    "上海餐馆": {
        "clues": ["Fremont", "上海菜", "心中最Top级"],
        "possible_names": ["Shanghai Restaurant", "Shanghai House", "Shanghai Cuisine"],
        "confidence": "medium"
    },
    "徽菜馆": {
        "clues": ["Fremont", "徽菜", "徽京人"],
        "possible_names": ["Anhui Cuisine", "Anhui House"],
        "confidence": "medium"
    },
    "山城私房菜": {
        "clues": ["Milpitas", "山城", "私房菜"],
        "possible_names": ["Mountain City", "Shancheng"],
        "confidence": "medium"
    },
    "Yuan Bistro": {
        "clues": ["Milpitas", "东北菜", "份量大"],
        "possible_names": ["Yuan Bistro"],
        "confidence": "high"  # 英文名确定
    },
    "家常菜馆": {
        "clues": ["Milpitas", "家常菜", "三刷"],
        "possible_names": ["Home Style", "Family Kitchen"],
        "confidence": "low"
    },
    "MTV川湘家常菜": {
        "clues": ["Mountain View", "川湘", "新晋"],
        "possible_names": ["Chuanxiang", "Hunan House"],
        "confidence": "medium"
    },
    "MTV泰餐小馆": {
        "clues": ["Mountain View", "泰餐", "惊喜"],
        "possible_names": ["Thai Bistro", "Thai House"],
        "confidence": "medium"
    },
    "新疆拉条子": {
        "clues": ["Mountain View", "新疆", "拉条子"],
        "possible_names": ["Xinjiang Noodles", "Lamian House"],
        "confidence": "medium"
    },
    "云贵菜馆": {
        "clues": ["Mountain View", "云贵", "烧椒菜", "儿童友好"],
        "possible_names": ["Yungui", "Yunnan Guizhou"],
        "confidence": "medium"
    },
    "湾区第一牛肉面": {
        "clues": ["Mountain View", "牛肉面", "水饺"],
        "possible_names": ["Beef Noodle", "Best Noodles"],
        "confidence": "medium"
    },
    "包子铺": {
        "clues": ["Sunnyvale", "包子", "现做现蒸"],
        "possible_names": ["Bao Zi", "Dumpling House"],
        "confidence": "medium"
    },
    "淮扬菜餐厅": {
        "clues": ["Sunnyvale", "淮扬菜", "新派"],
        "possible_names": ["Huaiyang", "Yangzhou"],
        "confidence": "medium"
    },
    "上海家常菜": {
        "clues": ["Sunnyvale", "上海", "平价", "家常味"],
        "possible_names": ["Shanghai Home", "Shanghai Family"],
        "confidence": "medium"
    },
    "Wakusei拉面": {
        "clues": ["Sunnyvale", "拉面", "最贵", "Wakusei"],
        "possible_names": ["Wakusei Ramen"],
        "confidence": "high"  # 英文名确定
    },
    "蒸饭专门店": {
        "clues": ["Sunnyvale", "蒸饭"],
        "possible_names": ["Steam Rice", "Steamed Rice"],
        "confidence": "low"
    },
    "黄鱼年糕": {
        "clues": ["Sunnyvale", "黄鱼", "年糕"],
        "possible_names": ["Fish Rice Cake", "Nian Gao"],
        "confidence": "low"
    }
}

def generate_verification_ui_data():
    """生成供UI使用的验证数据"""
    
    # 读取数据库
    db_path = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json')
    with open(db_path, 'r') as f:
        data = json.load(f)
    
    # 收集需要验证的餐厅
    needs_verification = []
    
    for r in data['restaurants']:
        name = r['name']
        
        # 跳过已准确验证的
        if r.get('verified') and 'Google Maps' in str(r.get('verification_note', '')):
            continue
        
        # 跳过原有已验证的
        if r.get('verified') and r['id'] in [f"r{i:03d}" for i in range(1, 23)]:
            continue
        
        # 获取线索
        clues = ADDRESS_CLUES.get(name, {})
        
        needs_verification.append({
            'id': r['id'],
            'name': r['name'],
            'name_en': r.get('name_en', ''),
            'city': r.get('area', r.get('location', '')),
            'current_address': r.get('address', ''),
            'coordinates': r.get('coordinates'),
            'clues': clues.get('clues', []),
            'possible_names': clues.get('possible_names', []),
            'confidence': clues.get('confidence', 'low'),
            'source_title': r.get('source_title', '')
        })
    
    # 保存验证清单
    output_path = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/verification_checklist.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(needs_verification),
            'restaurants': needs_verification,
            'instructions': {
                'method_1': 'Google Maps搜索: 餐厅名 + 城市',
                'method_2': 'Yelp搜索: 餐厅英文名 + 城市',
                'method_3': '小红书搜索: 原帖子查看评论区地址',
                'action_if_correct': '标记verified=true',
                'action_if_wrong': '提供正确地址'
            }
        }, f, ensure_ascii=False, indent=2)
    
    print(f"📋 生成验证清单: {len(needs_verification)} 家餐厅")
    print(f"💾 保存至: {output_path}")
    
    # 生成验证指南
    print("\n" + "="*60)
    print("🔍 餐厅验证指南 (无需API)")
    print("="*60)
    
    for r in needs_verification[:5]:
        print(f"\n{r['name']} ({r['city']})")
        print(f"  当前地址: {r['current_address']}")
        print(f"  搜索关键词: {r['name']} {r['city']} | {' | '.join(r['possible_names'][:2])} {r['city']}")
        print(f"  线索: {', '.join(r['clues'][:3])}")
        print(f"  来源: {r['source_title'][:40]}...")
    
    if len(needs_verification) > 5:
        print(f"\n... 还有 {len(needs_verification)-5} 家")
    
    return needs_verification

if __name__ == '__main__':
    generate_verification_ui_data()
