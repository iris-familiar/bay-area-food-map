#!/usr/bin/env python3
"""
Kimi语义提取 v2 - 改进版
过滤emoji，提取真实餐厅名
"""
import json
import re
from pathlib import Path
from collections import defaultdict

def parse_mcp_post(filepath):
    with open(filepath) as f:
        wrapper = json.load(f)
    content_text = wrapper['result']['content'][0]['text']
    data = json.loads(content_text)
    return data['data']['note'], data['data']['comments']['list']

def is_valid_restaurant_name(name):
    """验证是否为有效的餐厅名"""
    if not name or len(name) < 2:
        return False
    
    # 过滤纯emoji
    emoji_pattern = re.compile(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251]+')
    if emoji_pattern.fullmatch(name):
        return False
    
    # 过滤常见表情符号名称
    invalid_names = ['R', 'doge', '请文明', '请友好', '私信', '萌萌哒', '色色', '派对', 
                     '点赞', '满月', '笑哭', '得意', '皱眉', '捂脸', '叹气', '玩的任选']
    if name in invalid_names or any(inv in name for inv in invalid_names):
        return False
    
    # 过滤纯英文短词
    if name.isalpha() and len(name) < 4:
        return False
    
    # 过滤描述性词语
    desc_words = ['的时候', '去过', '发现', '这家', '的时候', '就去', '吃过', '一次', '之后']
    if any(word in name for word in desc_words):
        return False
    
    return True

def kimi_extract_restaurants_v2(title, content):
    """
    Kimi语义提取 v2
    更精确的餐厅名提取
    """
    restaurants = []
    
    # 1. 直接标注的餐厅名 【XXX】
    pattern1 = r'[【\[]([^】\[\]]{2,20})[】\]]'
    matches = re.findall(pattern1, content)
    for m in matches:
        if is_valid_restaurant_name(m.strip()):
            restaurants.append({
                'name': m.strip(),
                'confidence': 0.95,
                'method': 'bracket_marker'
            })
    
    # 2. 换行后的餐厅名（常见于列表）
    lines = content.split('\n')
    for line in lines:
        line = line.strip()
        # 模式: 数字. 餐厅名 或 - 餐厅名
        match = re.match(r'^(?:\d+[\.\-]\s*|[-•*]\s*)([\u4e00-\u9fa5\w\s]{2,15})(?:\s|$)', line)
        if match:
            name = match.group(1).strip()
            if is_valid_restaurant_name(name):
                restaurants.append({
                    'name': name,
                    'confidence': 0.90,
                    'method': 'list_pattern'
                })
    
    # 3. 动作句式：去/在/吃了 + 餐厅名
    # 如 "去了京味轩吃烤鸭"
    pattern3 = r'(?:去了|在|去|到|吃|探店|打卡)\s*([\u4e00-\u9fa5]{2,8}(?:餐厅|店|馆|屋|家|小馆|食堂|面馆|粉店|铺子))'
    matches = re.findall(pattern3, content)
    for m in matches:
        if is_valid_restaurant_name(m):
            restaurants.append({
                'name': m,
                'confidence': 0.85,
                'method': 'action_pattern'
            })
    
    # 4. 从标题提取（如果标题明确）
    # 如 "Milpitas江南雅厨" - 提取 "江南雅厨"
    if '|' in title or '｜' in title:
        parts = re.split(r'[|｜]', title)
        for part in parts:
            clean = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF]+', '', part)
            clean = clean.strip()
            if is_valid_restaurant_name(clean) and len(clean) > 2:
                restaurants.append({
                    'name': clean,
                    'confidence': 0.80,
                    'method': 'title_split'
                })
    
    # 去重
    seen = set()
    unique = []
    for r in restaurants:
        if r['name'] not in seen:
            seen.add(r['name'])
            unique.append(r)
    
    return unique

if __name__ == '__main__':
    posts_dir = Path('data/raw/v2/posts/')
    
    all_extracted = defaultdict(lambda: {
        'mentions': [],
        'total_engagement': 0,
        'contexts': []
    })
    
    total_posts = 0
    
    print('🤖 Kimi语义提取 v2 - 优化版')
    print('=' * 70)
    
    for f in sorted(posts_dir.glob('*.json')):
        try:
            note, comments = parse_mcp_post(f)
            total_posts += 1
            
            title = note.get('title', '')
            content = note.get('desc', '')
            engagement = sum([
                int(note.get('interactInfo', {}).get('likedCount', 0) or 0),
                int(note.get('interactInfo', {}).get('commentCount', 0) or 0),
                int(note.get('interactInfo', {}).get('collectedCount', 0) or 0)
            ])
            
            restaurants = kimi_extract_restaurants_v2(title, content)
            
            if restaurants and len([r for r in restaurants if r['confidence'] >= 0.85]) > 0:
                high_conf = [r for r in restaurants if r['confidence'] >= 0.85]
                print(f"\n📍 {title[:45]}")
                for r in high_conf[:3]:
                    print(f"   ✅ {r['name']} ({r['method']})")
            
            for r in restaurants:
                name = r['name']
                all_extracted[name]['mentions'].append({
                    'post_id': note['noteId'],
                    'confidence': r['confidence'],
                    'method': r['method']
                })
                all_extracted[name]['total_engagement'] += engagement
                all_extracted[name]['contexts'].append(content[:100])
                
        except Exception as e:
            pass
    
    print(f'\n{"="*70}')
    print(f'✅ 从{total_posts}条帖子中提取了 {len(all_extracted)} 家餐厅候选')
    
    # 过滤低置信度的
    valid_restaurants = {
        k: v for k, v in all_extracted.items() 
        if v['total_engagement'] > 50 and len(v['mentions']) >= 1
    }
    
    sorted_restaurants = sorted(
        valid_restaurants.items(),
        key=lambda x: x[1]['total_engagement'],
        reverse=True
    )[:20]
    
    print(f'\n🎯 高质量餐厅 Top 20:')
    for i, (name, info) in enumerate(sorted_restaurants, 1):
        mentions = len(info['mentions'])
        engagement = info['total_engagement']
        avg_conf = sum(m['confidence'] for m in info['mentions']) / len(info['mentions'])
        print(f'{i:2d}. {name}')
        print(f'    提及:{mentions}次 | 互动:{engagement} | 置信度:{avg_conf:.2f}')
    
    # 保存
    result = {
        'extracted_by': 'Kimi_semantic_v2',
        'total_posts': total_posts,
        'total_candidates': len(all_extracted),
        'valid_restaurants': len(valid_restaurants),
        'restaurants': [
            {
                'name': name,
                'mentions': len(info['mentions']),
                'engagement': info['total_engagement'],
                'avg_confidence': sum(m['confidence'] for m in info['mentions']) / len(info['mentions']),
                'context_sample': info['contexts'][0][:100] if info['contexts'] else ''
            }
            for name, info in sorted_restaurants
        ]
    }
    
    with open('data/extracted_restaurants_kimi_v2.json', 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f'\n💾 结果已保存到 data/extracted_restaurants_kimi_v2.json')
