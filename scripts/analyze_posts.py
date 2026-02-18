#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Manual restaurant extraction for 82 Xiaohongshu posts
Read each file and extract restaurants accurately
"""

import json
import os
import glob
import re
from datetime import datetime

def get_all_post_files(directory):
    return sorted(glob.glob(os.path.join(directory, "*.json")))

def extract_content_from_file(file_path):
    """从json文件中提取post内容和评论"""
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
            'full_text': title + '\n' + desc + '\n' + '\n'.join(comments_text[:10])
        }
    except Exception as e:
        return None

def analyze_post(post_data):
    """分析单个post，返回提取的餐厅信息列表"""
    text = post_data['full_text']
    
    # 提取数字列表模式的餐厅
    restaurants = []
    
    # 模式: 数字/符号 + 餐厅名
    lines = text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # 去掉数字前缀和表情
        cleaned = re.sub(r'^\d+[.、\s]*', '', line)
        cleaned = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩]\s*', '', cleaned)
        cleaned = re.sub(r'\[.*?\]', '', cleaned)  # 表情
        cleaned = cleaned.strip()
        
        # 提取餐厅名（通常在行首，后跟换行或描述）
        if cleaned and len(cleaned) >= 2:
            # 取前10个字符作为候选餐厅名
            candidate = cleaned[:15].split('，')[0].split('。')[0].split('！')[0]
            candidate = candidate.split(' ')[0]  # 取空格前的部分
            
            # 过滤掉明显不是餐厅名的
            if len(candidate) >= 2 and len(candidate) <= 20:
                if not any(x in candidate for x in ['话题', '湾区', '美国', '推荐', '好吃', '打卡']):
                    if not candidate.startswith('(') and not candidate.startswith('（'):
                        restaurants.append({
                            'name': candidate,
                            'context': line[:200]
                        })
    
    return restaurants

def main():
    POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'
    OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json'
    
    files = get_all_post_files(POSTS_DIR)
    print(f"Processing {len(files)} files...")
    
    all_posts = []
    for i, file_path in enumerate(files):
        post_data = extract_content_from_file(file_path)
        if post_data:
            all_posts.append(post_data)
    
    print(f"Successfully loaded {len(all_posts)} posts")
    
    # 输出所有帖子的摘要用于人工审核
    output = {
        'posts': []
    }
    
    for post in all_posts:
        extracted = analyze_post(post)
        output['posts'].append({
            'post_id': post['post_id'],
            'title': post['title'],
            'date': post['date'],
            'engagement': post['engagement'],
            'extracted_restaurants': extracted,
            'desc_preview': post['desc'][:300] + '...' if len(post['desc']) > 300 else post['desc']
        })
    
    # 保存分析结果
    with open('/tmp/post_analysis.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"Analysis saved to /tmp/post_analysis.json")
    
    return all_posts

if __name__ == '__main__':
    main()
