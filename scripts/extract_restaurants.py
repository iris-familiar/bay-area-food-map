#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract restaurant information from 82 Xiaohongshu posts using LLM
"""

import json
import os
import glob
from pathlib import Path
import subprocess

def get_all_post_files(directory):
    """获取所有post json文件"""
    return sorted(glob.glob(os.path.join(directory, "*.json")))

def extract_content_from_file(file_path):
    """从json文件中提取post内容和评论"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 提取post信息
        result = data.get('jsonrpc') and data.get('result') and data.get('result', {}).get('content', [{}])[0]
        if not result:
            return None
            
        inner_text = result.get('text', '{}')
        inner_data = json.loads(inner_text)
        
        note = inner_data.get('data', {}).get('note', {})
        comments = inner_data.get('data', {}).get('comments', {}).get('list', [])
        
        post_id = note.get('noteId', '')
        title = note.get('title', '')
        desc = note.get('desc', '')
        time_ms = note.get('time', 0)
        
        # 转换时间戳
        from datetime import datetime
        post_date = datetime.fromtimestamp(time_ms / 1000).strftime('%Y-%m-%d') if time_ms else ''
        
        # 提取互动数据
        interact = note.get('interactInfo', {})
        liked_count = int(interact.get('likedCount', '0') or '0')
        comment_count = int(interact.get('commentCount', '0') or '0')
        collected_count = int(interact.get('collectedCount', '0') or '0')
        total_engagement = liked_count + comment_count + collected_count
        
        # 提取所有评论内容
        comments_text = []
        for c in comments:
            comments_text.append(c.get('content', ''))
            # 包含子评论
            for sub in c.get('subComments', []):
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
            'comments': comments_text
        }
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return None

def create_extraction_prompt(post_data):
    """创建用于LLM提取餐厅信息的prompt"""
    comments_text = '\n'.join([f'- {c}' for c in post_data['comments'][:20]])  # 限制评论数量
    
    prompt = f"""请分析以下小红书美食帖子，提取所有提到的餐厅信息。

【帖子标题】: {post_data['title']}

【帖子正文】:
{post_data['desc']}

【部分评论】:
{comments_text}

请提取餐厅信息，并以JSON格式输出。注意：
1. 如果帖子提到多家餐厅，请提取所有餐厅
2. 餐厅名使用标准中文名称
3. 菜系可以是：川菜、湘菜、粤菜、江浙菜、东北菜、日料、韩餐、泰国菜、越南菜、火锅、烧烤、烧烤、早茶、拉面、饺子、面包店、甜品店等
4. 地区从文本中提取（如：Cupertino、Sunnyvale、Fremont、San Jose、Mountain View、Palo Alto、Milpitas等）
5. 价格范围根据描述判断（$、$$、$$$、$$$$）
6. 推荐菜品从帖子内容中提取

输出格式：
```json
{{
  "restaurants": [
    {{
      "name": "餐厅中文名",
      "name_en": "English Name（如有）",
      "cuisine": "菜系",
      "area": "地区",
      "price_range": "$-$$$$",
      "recommendations": ["推荐菜品1", "推荐菜品2"],
      "context": "帖子中关于该餐厅的描述段落"
    }}
  ]
}}
```

如果没有找到餐厅信息，请输出：{{"restaurants": []}}
"""
    return prompt

def call_llm_extract(prompt):
    """调用LLM提取餐厅信息"""
    try:
        # 使用OpenClaw的agent功能调用LLM
        import requests
        
        # 调用本地LLM API
        response = requests.post(
            'http://localhost:3456/v1/chat/completions',
            json={
                'model': 'kimi-coding/k2p5',
                'messages': [
                    {'role': 'system', 'content': '你是一个专业的餐厅信息提取助手。请仔细分析帖子内容，提取准确的餐厅信息。只输出JSON格式，不要有多余的文字。'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.1,
                'max_tokens': 2000
            },
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['choices'][0]['message']['content']
            
            # 提取JSON部分
            import re
            json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            
            # 尝试直接解析
            try:
                return json.loads(content)
            except:
                print(f"Could not parse LLM response: {content[:200]}")
                return {"restaurants": []}
        else:
            print(f"LLM API error: {response.status_code}")
            return {"restaurants": []}
    except Exception as e:
        print(f"Error calling LLM: {e}")
        return {"restaurants": []}

def process_all_posts(posts_dir, output_file):
    """处理所有post文件并提取餐厅信息"""
    files = get_all_post_files(posts_dir)
    print(f"Found {len(files)} post files")
    
    all_restaurants = {}
    restaurant_counter = 1
    
    for i, file_path in enumerate(files):
        print(f"\n[{i+1}/{len(files)}] Processing: {os.path.basename(file_path)}")
        
        post_data = extract_content_from_file(file_path)
        if not post_data:
            print(f"  Skipped: could not extract content")
            continue
        
        print(f"  Title: {post_data['title'][:60]}...")
        print(f"  Engagement: {post_data['engagement']} (likes: {post_data['liked_count']}, comments: {post_data['comment_count']}, collects: {post_data['collected_count']})")
        
        # 创建提取prompt
        prompt = create_extraction_prompt(post_data)
        
        # 调用LLM提取餐厅信息
        extracted = call_llm_extract(prompt)
        
        restaurants = extracted.get('restaurants', [])
        print(f"  Found {len(restaurants)} restaurant(s)")
        
        # 处理提取的餐厅
        for r in restaurants:
            name = r.get('name', '').strip()
            if not name:
                continue
            
            # 使用餐厅名作为key进行去重
            key = name.lower().replace(' ', '')
            
            if key not in all_restaurants:
                all_restaurants[key] = {
                    'id': f'r{restaurant_counter:03d}',
                    'name': name,
                    'name_en': r.get('name_en', ''),
                    'cuisine': r.get('cuisine', ''),
                    'area': r.get('area', ''),
                    'price_range': r.get('price_range', ''),
                    'total_engagement': 0,
                    'mention_count': 0,
                    'sources': [],
                    'recommendations': [],
                    'post_details': []
                }
                restaurant_counter += 1
            
            # 更新餐厅信息
            rest = all_restaurants[key]
            rest['total_engagement'] += post_data['engagement']
            rest['mention_count'] += 1
            rest['sources'].append(post_data['post_id'])
            
            # 合并推荐菜品
            recs = r.get('recommendations', [])
            for rec in recs:
                if rec and rec not in rest['recommendations']:
                    rest['recommendations'].append(rec)
            
            # 添加post详情
            rest['post_details'].append({
                'post_id': post_data['post_id'],
                'title': post_data['title'],
                'date': post_data['date'],
                'engagement': post_data['engagement'],
                'context': r.get('context', '')[:200]  # 限制上下文长度
            })
        
        # 每10个文件保存一次中间结果
        if (i + 1) % 10 == 0:
            save_progress(all_restaurants, output_file, i + 1, len(files))
    
    # 保存最终结果
    save_final_result(all_restaurants, output_file)
    return all_restaurants

def save_progress(restaurants, output_file, processed, total):
    """保存中间进度"""
    result = {
        'restaurants': list(restaurants.values()),
        'meta': {
            'processed_files': processed,
            'total_files': total,
            'total_restaurants': len(restaurants),
            'status': 'in_progress'
        }
    }
    
    temp_file = output_file.replace('.json', '_temp.json')
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"  [Progress] Saved to {temp_file}: {len(restaurants)} restaurants from {processed} files")

def save_final_result(restaurants, output_file):
    """保存最终结果"""
    result = {
        'restaurants': list(restaurants.values()),
        'meta': {
            'total_restaurants': len(restaurants),
            'status': 'completed'
        }
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Final result saved to {output_file}")
    print(f"   Total restaurants found: {len(restaurants)}")

if __name__ == '__main__':
    POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'
    OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json'
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    process_all_posts(POSTS_DIR, OUTPUT_FILE)
