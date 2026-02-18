#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comprehensive restaurant extraction from 82 Xiaohongshu posts
Manual extraction with intelligent pattern matching
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
        
        # 提取所有评论
        comments_list = []
        for c in comments:
            comments_list.append({
                'content': c.get('content', ''),
                'likes': c.get('likeCount', '0')
            })
            for sub in c.get('subComments', []):
                if sub:
                    comments_list.append({
                        'content': sub.get('content', ''),
                        'likes': sub.get('likeCount', '0')
                    })
        
        return {
            'post_id': post_id,
            'title': title,
            'desc': desc,
            'date': post_date,
            'engagement': total_engagement,
            'liked_count': liked_count,
            'comment_count': comment_count,
            'collected_count': collected_count,
            'comments': comments_list
        }
    except Exception as e:
        print(f"Error: {file_path} - {e}")
        return None

# 手工定义的餐厅提取规则
# 基于标题和正文内容的关键字提取

def extract_restaurants_manual(post_data):
    """从帖子中手动提取餐厅信息"""
    title = post_data['title']
    desc = post_data['desc']
    text = title + '\n' + desc
    
    restaurants = []
    
    # 提取模式1: 中文餐厅名（通常在列表开头）
    # 格式: "1. 餐厅名" 或 "① 餐厅名"
    
    # 按行分析
    lines = desc.split('\n')
    for line in lines:
        line = line.strip()
        
        # 跳过空行和话题标签
        if not line or line.startswith('#') or '话题' in line:
            continue
        
        # 提取数字列表项
        # 匹配: "1. 餐厅名", "1、餐厅名", "① 餐厅名", "❶ 餐厅名"
        match = re.match(r'^(?:\d+[.、\s]+|[①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺]\s*)([^\n]{2,30})$', line)
        if match:
            candidate = match.group(1).strip()
            # 清理候选名称
            candidate = re.sub(r'\[.*?\]', '', candidate)  # 去掉表情
            candidate = candidate.split('（')[0].split('(')[0]  # 去掉括号注释
            candidate = candidate.split('，')[0].split('。')[0]  # 只取第一部分
            
            # 过滤掉太短的和明显不是餐厅名的
            if len(candidate) >= 2 and len(candidate) <= 20:
                # 过滤掉常见的非餐厅词
                skip_words = ['推荐', '好吃', '打卡', '湾区', '美国', '最近', '今天', '这次', '发现', '这家']
                if not any(candidate.startswith(w) or candidate == w for w in skip_words):
                    # 排除纯描述性文字
                    if not re.match(r'^[\u4e00-\u9fa5]{2,4}(?:店|餐厅|馆)$', candidate):  # 太通用的名字
                        restaurants.append({
                            'name': candidate,
                            'source_line': line
                        })
    
    return restaurants

def main():
    POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'
    OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json'
    
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    files = get_all_post_files(POSTS_DIR)
    print(f"Processing {len(files)} files...\n")
    
    all_restaurants = {}
    restaurant_counter = 1
    
    for i, file_path in enumerate(files):
        post_data = extract_post_data(file_path)
        if not post_data:
            continue
        
        # 提取餐厅
        extracted = extract_restaurants_manual(post_data)
        
        if extracted:
            print(f"[{i+1}] {post_data['title'][:50]}...")
            print(f"    Engagement: {post_data['engagement']}")
            
            for r in extracted:
                name = r['name']
                print(f"    -> {name}")
                
                # 添加到数据库
                key = name.lower().replace(' ', '')
                if key not in all_restaurants:
                    all_restaurants[key] = {
                        'id': f'r{restaurant_counter:03d}',
                        'name': name,
                        'name_en': '',
                        'cuisine': '',
                        'area': '',
                        'price_range': '',
                        'total_engagement': 0,
                        'mention_count': 0,
                        'sources': [],
                        'recommendations': [],
                        'post_details': []
                    }
                    restaurant_counter += 1
                
                # 更新信息
                rest = all_restaurants[key]
                rest['total_engagement'] += post_data['engagement']
                rest['mention_count'] += 1
                rest['sources'].append(post_data['post_id'])
                rest['post_details'].append({
                    'post_id': post_data['post_id'],
                    'title': post_data['title'],
                    'date': post_data['date'],
                    'engagement': post_data['engagement'],
                    'context': r['source_line'][:200]
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
            'status': 'completed'
        }
    }
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"✅ Extracted {len(all_restaurants)} restaurants")
    print(f"✅ Saved to {OUTPUT_FILE}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
