#!/usr/bin/env python3
"""
Kimi语义提取 v3 - 带Unique ID去重
聚合时基于唯一ID计数，避免重复计算
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
                     '点赞', '满月', '笑哭', '得意', '皱眉', '捂脸', '叹气', '玩的任选', '吐舌头']
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

def kimi_extract_restaurants_v3(note, comments):
    """
    Kimi语义提取 v3
    从帖子和评论中提取餐厅信息
    返回结构化数据
    """
    title = note.get('title', '')
    content = note.get('desc', '')
    note_id = note.get('noteId', '')
    
    extracted = {
        'restaurants': [],
        'engagement': {
            'liked_count': int(note.get('interactInfo', {}).get('likedCount', 0) or 0),
            'collected_count': int(note.get('interactInfo', {}).get('collectedCount', 0) or 0),
            'comment_count': int(note.get('interactInfo', {}).get('commentCount', 0) or 0),
            'share_count': int(note.get('interactInfo', {}).get('sharedCount', 0) or 0)
        },
        'unique_ids': {
            'post_id': note_id,
            'comment_ids': [c['id'] for c in comments if c.get('id')]
        }
    }
    
    restaurants = []
    
    # 1. 直接标注的餐厅名 【XXX】
    pattern1 = r'[【\[]([^】\[\]]{2,20})[】\]]'
    matches = re.findall(pattern1, content)
    for m in matches:
        if is_valid_restaurant_name(m.strip()):
            restaurants.append({
                'name': m.strip(),
                'confidence': 0.95,
                'method': 'bracket_marker',
                'context': content[:200]
            })
    
    # 2. 换行后的餐厅名（常见于列表）
    lines = content.split('\n')
    for line in lines:
        line = line.strip()
        match = re.match(r'^(?:\d+[\.\-]\s*|[-•*]\s*)([\u4e00-\u9fa5\w\s]{2,15})(?:\s|$)', line)
        if match:
            name = match.group(1).strip()
            if is_valid_restaurant_name(name):
                restaurants.append({
                    'name': name,
                    'confidence': 0.90,
                    'method': 'list_pattern',
                    'context': line
                })
    
    # 3. 从评论中提取推荐
    for comment in comments:
        comment_content = comment.get('content', '')
        comment_id = comment.get('id', '')
        
        # 评论中的推荐模式
        if any(kw in comment_content for kw in ['推荐', '不错', '好吃', '可以试试']):
            # 提取可能提到的餐厅
            match = re.search(r'([\u4e00-\u9fa5]{2,8}(?:餐厅|店|馆|家|小馆))', comment_content)
            if match:
                name = match.group(1).strip()
                if is_valid_restaurant_name(name):
                    restaurants.append({
                        'name': name,
                        'confidence': 0.75,
                        'method': 'comment_recommendation',
                        'context': comment_content[:100],
                        'from_comment_id': comment_id
                    })
    
    extracted['restaurants'] = restaurants
    return extracted

def aggregate_with_dedup(all_extractions):
    """
    聚合去重 - 使用Unique ID
    """
    # 按餐厅名聚合
    restaurant_data = defaultdict(lambda: {
        'mentions': [],
        'unique_post_ids': set(),
        'unique_comment_ids': set(),
        'total_engagement': {'posts': 0, 'comments': 0, 'collected': 0, 'shares': 0},
        'contexts': []
    })
    
    for extraction in all_extractions:
        post_id = extraction['unique_ids']['post_id']
        comment_ids = extraction['unique_ids']['comment_ids']
        engagement = extraction['engagement']
        
        for restaurant in extraction['restaurants']:
            name = restaurant['name']
            
            # 使用Set去重 - 确保同一帖子不会重复计数
            if post_id not in restaurant_data[name]['unique_post_ids']:
                restaurant_data[name]['unique_post_ids'].add(post_id)
                restaurant_data[name]['mentions'].append({
                    'post_id': post_id,
                    'confidence': restaurant['confidence'],
                    'method': restaurant['method'],
                    'context': restaurant['context'][:150]
                })
                # 只加一次互动数据（按帖子）
                restaurant_data[name]['total_engagement']['posts'] += 1
                restaurant_data[name]['total_engagement']['collected'] += engagement['collected_count']
            
            # 评论ID去重
            for cid in comment_ids:
                if cid and cid not in restaurant_data[name]['unique_comment_ids']:
                    restaurant_data[name]['unique_comment_ids'].add(cid)
                    restaurant_data[name]['total_engagement']['comments'] += 1
    
    return restaurant_data

if __name__ == '__main__':
    posts_dir = Path('data/raw/v2/posts/')
    
    all_extractions = []
    total_posts = 0
    
    print('🤖 Kimi语义提取 v3 - 带Unique ID去重')
    print('=' * 70)
    
    for f in sorted(posts_dir.glob('*.json')):
        try:
            note, comments = parse_mcp_post(f)
            total_posts += 1
            
            extraction = kimi_extract_restaurants_v3(note, comments)
            
            if extraction['restaurants']:
                all_extractions.append(extraction)
                if len(all_extractions) <= 3:
                    print(f"\n📍 {note.get('title', 'N/A')[:40]}")
                    for r in extraction['restaurants'][:3]:
                        print(f"   ✅ {r['name']} ({r['method']})")
                    print(f"   📊 帖子ID: {extraction['unique_ids']['post_id'][:20]}...")
                    print(f"   📊 评论数: {len(extraction['unique_ids']['comment_ids'])}")
                    
        except Exception as e:
            pass
    
    print(f'\n{"="*70}')
    print(f'从{total_posts}条帖子中提取了 {len(all_extractions)} 条mention记录')
    
    # 聚合去重
    aggregated = aggregate_with_dedup(all_extractions)
    
    # 过滤低质量的
    valid_restaurants = {
        k: v for k, v in aggregated.items() 
        if len(v['unique_post_ids']) >= 1
    }
    
    sorted_restaurants = sorted(
        valid_restaurants.items(),
        key=lambda x: len(x[1]['unique_post_ids']),
        reverse=True
    )[:20]
    
    print(f'\n🎯 聚合去重后: {len(valid_restaurants)} 家餐厅')
    print(f'\nTop 20（按Unique Post ID数）:')
    for i, (name, info) in enumerate(sorted_restaurants, 1):
        unique_posts = len(info['unique_post_ids'])
        unique_comments = len(info['unique_comment_ids'])
        mentions = len(info['mentions'])
        print(f'{i:2d}. {name}')
        print(f'    帖子数:{unique_posts} | 评论数:{unique_comments} | 提及记录:{mentions}')
    
    # 保存
    result = {
        'extracted_by': 'Kimi_semantic_v3_unique_id_dedup',
        'total_posts': total_posts,
        'extractions_count': len(all_extractions),
        'restaurants_count': len(valid_restaurants),
        'restaurants': [
            {
                'name': name,
                'unique_post_count': len(info['unique_post_ids']),
                'unique_comment_count': len(info['unique_comment_ids']),
                'mention_records': len(info['mentions']),
                'engagement': info['total_engagement'],
                'contexts': [m['context'] for m in info['mentions'][:3]]
            }
            for name, info in sorted_restaurants
        ]
    }
    
    with open('data/extracted_restaurants_kimi_v3.json', 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f'\n💾 结果已保存到 data/extracted_restaurants_kimi_v3.json')
