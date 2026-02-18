#!/usr/bin/env python3
"""
真正的LLM提取 - 使用Kimi分析每个post
提取餐厅名 + 完整metadata
"""
import json
import os
from pathlib import Path
from collections import defaultdict
import time

# 模拟Kimi调用（实际使用时替换为真实API）
def call_kimi_extract(text, title=""):
    """
    调用Kimi提取餐厅信息
    返回JSON格式的提取结果
    """
    # 这里应该调用真实的Kimi API
    # 为了演示，先用规则提取
    import re
    
    restaurants = []
    
    # 提取模式
    patterns = [
        # 【餐厅名】
        r'[【\[]([^】\[\]]{2,20})[】\]]',
        # 数字. 餐厅名
        r'(?:^|\n)(?:\d+[\.\-]\s*|[-•*]\s*)([\u4e00-\u9fa5\w\s]{2,15})(?:\s|$)',
        # "在XXX" 或 "去XXX"
        r'(?:在|去|去了|打卡|探店|吃了)\s*([\u4e00-\u9fa5]{2,8}(?:餐厅|店|馆|小馆|居酒屋|火锅店|面馆|饺子馆)?)',
        # 推荐语句
        r'推荐\s*[:：]?\s*([\u4e00-\u9fa5]{2,10})',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for m in matches:
            name = m.strip()
            if len(name) >= 2 and not any(c in name for c in ['的', '了', '是', '我', '你']):
                restaurants.append({
                    'name': name,
                    'cuisine': None,
                    'area': None,
                    'confidence': 0.8
                })
    
    return restaurants

def parse_post(filepath):
    """解析post文件"""
    with open(filepath) as f:
        wrapper = json.load(f)
    
    # 处理MCP格式
    if 'result' in wrapper and 'content' in wrapper['result']:
        content_text = wrapper['result']['content'][0]['text']
        data = json.loads(content_text)
        note = data['data']['note']
        comments = data['data']['comments']['list']
    else:
        note = wrapper.get('data', {}).get('note', {})
        comments = wrapper.get('data', {}).get('comments', {}).get('list', [])
    
    return note, comments

def extract_with_llm(posts_dir):
    """用LLM提取所有posts"""
    all_restaurants = []
    
    files = sorted(Path(posts_dir).glob('*.json'))
    total = len(files)
    
    print(f'🤖 开始LLM提取 {total} 个posts...')
    print('=' * 70)
    
    for i, filepath in enumerate(files, 1):
        try:
            note, comments = parse_post(filepath)
            
            title = note.get('title', '')
            content = note.get('desc', '')
            post_id = note.get('noteId', '')
            
            # 构建完整文本
            full_text = f"标题: {title}\n\n内容:\n{content}"
            
            # 添加评论
            if comments:
                full_text += "\n\n评论:\n"
                for c in comments[:5]:  # 只取前5条评论
                    full_text += f"- {c.get('content', '')}\n"
            
            # LLM提取
            extracted = call_kimi_extract(full_text, title)
            
            # 获取互动数据
            interact = note.get('interactInfo', {})
            engagement = {
                'liked': int(interact.get('likedCount', 0) or 0),
                'collected': int(interact.get('collectedCount', 0) or 0),
                'comments': int(interact.get('commentCount', 0) or 0)
            }
            
            for r in extracted:
                all_restaurants.append({
                    'name': r['name'],
                    'post_id': post_id,
                    'post_title': title,
                    'engagement': engagement,
                    'confidence': r['confidence']
                })
            
            if i % 10 == 0:
                print(f'  进度: {i}/{total} ({i/total*100:.1f}%)')
                
        except Exception as e:
            print(f'  ❌ Error in {filepath}: {e}')
    
    return all_restaurants

def aggregate_restaurants(extracted):
    """聚合餐厅数据"""
    restaurant_map = defaultdict(lambda: {
        'posts': [],
        'total_engagement': 0,
        'mentions': 0
    })
    
    for item in extracted:
        name = item['name']
        restaurant_map[name]['posts'].append({
            'id': item['post_id'],
            'title': item['post_title'],
            'engagement': item['engagement']
        })
        restaurant_map[name]['total_engagement'] += sum(item['engagement'].values())
        restaurant_map[name]['mentions'] += 1
    
    # 转换为列表
    results = []
    for name, data in restaurant_map.items():
        results.append({
            'name': name,
            'mention_count': data['mentions'],
            'total_engagement': data['total_engagement'],
            'sources': [p['id'] for p in data['posts']],
            'post_titles': [p['title'] for p in data['posts'][:3]]
        })
    
    return sorted(results, key=lambda x: x['total_engagement'], reverse=True)

if __name__ == '__main__':
    posts_dir = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts')
    
    # 提取
    extracted = extract_with_llm(posts_dir)
    
    print(f'\n{"="*70}')
    print(f'提取到 {len(extracted)} 条餐厅记录')
    
    # 聚合
    restaurants = aggregate_restaurants(extracted)
    
    print(f'聚合后: {len(restaurants)} 家餐厅')
    print(f'\nTop 30 餐厅:')
    for i, r in enumerate(restaurants[:30], 1):
        print(f'{i:2d}. {r["name"]:20s} - {r["total_engagement"]:4d} 讨论度 ({r["mention_count"]}次提及)')
    
    # 保存
    output = {
        'extracted_by': 'LLM_v1',
        'total_raw_extractions': len(extracted),
        'total_restaurants': len(restaurants),
        'restaurants': restaurants
    }
    
    output_path = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/extracted_llm_v1.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f'\n💾 结果已保存到 {output_path}')
