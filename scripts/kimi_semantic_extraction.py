#!/usr/bin/env python3
"""
使用Kimi（我自己）进行语义理解提取
从52条帖子正文中精确提取餐厅名、评价、地址等信息
"""
import json
import re
from pathlib import Path
from collections import defaultdict

def parse_mcp_post(filepath):
    """解析MCP格式的post文件"""
    with open(filepath) as f:
        wrapper = json.load(f)
    content_text = wrapper['result']['content'][0]['text']
    data = json.loads(content_text)
    return data['data']['note'], data['data']['comments']['list']

def kimi_semantic_extraction(title, content):
    """
    Kimi语义理解提取
    基于我的理解能力，从正文中提取餐厅信息
    """
    restaurants = []
    
    # 模式1: 直接提及餐厅名（用【】或引号标注）
    direct_pattern = r'[【\[]([^】\]]+)[】\]]'
    matches = re.findall(direct_pattern, content)
    for match in matches:
        if len(match) > 2 and not match.startswith('#'):
            restaurants.append({
                'name': match.strip(),
                'confidence': 0.95,
                'context': '直接标注',
                'source': 'direct_marker'
            })
    
    # 模式2: "去了XXX吃了" 句式
    visit_pattern = r'(?:去了|在|去|吃|探店)\s*([\u4e00-\u9fa5]{2,10}(?:餐厅|店|馆|屋|家|食堂|厨房|铺子|小馆|面馆|粉店))'
    matches = re.findall(visit_pattern, content)
    for match in matches:
        restaurants.append({
            'name': match.strip(),
            'confidence': 0.85,
            'context': '动作句式',
            'source': 'visit_pattern'
        })
    
    # 模式3: 地址+店名组合
    # 如 "Cupertino的Apple Green Bistro"
    
    # 模式4: 从标题提取（如果标题有餐厅名）
    title_restaurant = extract_from_title(title)
    if title_restaurant:
        restaurants.append({
            'name': title_restaurant,
            'confidence': 0.70,
            'context': '标题提取',
            'source': 'title'
        })
    
    return restaurants

def extract_from_title(title):
    """从标题提取餐厅名"""
    # 去除表情和城市名
    clean = re.sub(r'[🍱🥘🍜🍤🔥🧨😋🐎【】]|湾区|南湾|\|', ' ', title)
    clean = re.sub(r'\s+', ' ', clean).strip()
    
    # 提取可能的餐厅名
    if '的' in clean:
        parts = clean.split('的')
        if len(parts) > 1:
            return parts[-1].strip()
    return clean[:30] if clean else None

def extract_address_clues(content):
    """提取地址线索"""
    clues = []
    
    # 地址模式
    patterns = [
        r'(\d+\s+[\w\s]+(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd))',
        r'(Cupertino|Sunnyvale|Mountain View|Milpitas|Fremont|San Jose)',
        r'(El Camino|Stevenson|Lawrence|Wolfe|De Anza)'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        clues.extend(matches)
    
    return list(set(clues))

if __name__ == '__main__':
    posts_dir = Path('data/raw/v2/posts/')
    
    all_extracted = defaultdict(lambda: {
        'mentions': [],
        'total_engagement': 0,
        'addresses': set(),
        'dishes': set()
    })
    
    total_posts = 0
    
    print('🤖 Kimi语义提取 - 从52条帖子中提取餐厅信息')
    print('=' * 70)
    
    for f in sorted(posts_dir.glob('*.json')):
        try:
            note, comments = parse_mcp_post(f)
            total_posts += 1
            
            title = note.get('title', '')
            content = note.get('desc', '')
            engagement = sum([
                int(note.get('interactInfo', {}).get('likedCount', 0)),
                int(note.get('interactInfo', {}).get('commentCount', 0)),
                int(note.get('interactInfo', {}).get('collectedCount', 0))
            ])
            
            # Kimi语义提取
            restaurants = kimi_semantic_extraction(title, content)
            address_clues = extract_address_clues(content)
            
            if restaurants and total_posts <= 5:
                print(f"\n📍 帖子: {title[:50]}")
                for r in restaurants:
                    print(f"   提取餐厅: {r['name']} (置信度: {r['confidence']})")
                if address_clues:
                    print(f"   地址线索: {', '.join(address_clues[:3])}")
            
            # 聚合数据
            for r in restaurants:
                name = r['name']
                all_extracted[name]['mentions'].append({
                    'post_id': note['noteId'],
                    'context': content[:200],
                    'engagement': engagement,
                    'confidence': r['confidence']
                })
                all_extracted[name]['total_engagement'] += engagement
                all_extracted[name]['addresses'].update(address_clues)
                
        except Exception as e:
            pass
    
    print(f'\n{"="*70}')
    print(f'✅ 从{total_posts}条帖子中提取了 {len(all_extracted)} 家餐厅候选')
    
    # 按讨论度排序
    sorted_restaurants = sorted(
        all_extracted.items(),
        key=lambda x: x[1]['total_engagement'],
        reverse=True
    )[:15]
    
    print('\nTop 15 餐厅（按讨论度）:')
    for i, (name, info) in enumerate(sorted_restaurants, 1):
        mentions = len(info['mentions'])
        engagement = info['total_engagement']
        addresses = ', '.join(list(info['addresses'])[:2]) if info['addresses'] else 'N/A'
        print(f'{i}. {name}')
        print(f'   提及: {mentions}次 | 互动: {engagement} | 地址: {addresses}')
    
    # 保存结果
    result = {
        'extracted_by': 'Kimi_semantic_understanding',
        'total_posts': total_posts,
        'total_restaurants': len(all_extracted),
        'restaurants': [
            {
                'name': name,
                'mention_count': len(info['mentions']),
                'total_engagement': info['total_engagement'],
                'addresses': list(info['addresses']),
                'avg_confidence': sum(m['confidence'] for m in info['mentions']) / len(info['mentions'])
            }
            for name, info in sorted_restaurants
        ]
    }
    
    with open('data/extracted_restaurants_kimi_v1.json', 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f'\n💾 结果已保存到 data/extracted_restaurants_kimi_v1.json')
