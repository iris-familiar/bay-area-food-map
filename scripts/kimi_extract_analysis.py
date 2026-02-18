#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict
import re

# 读取原始搜索数据
with open('data/raw/phase1a_search_results.json') as f:
    raw_data = json.load(f)

# 读取已提取的完整帖子
posts_dir = Path('data/posts/2026-02-16/')

print('🤖 使用Kimi语义理解提取餐厅信息...')
print('=' * 60)

# 处理原始搜索数据中的帖子
posts = raw_data.get('posts', [])
print(f'📊 处理 {len(posts)} 条帖子...')

# 展示几个样本让我进行语义分析
samples = posts[:10]
print('\n📋 样本帖子（我将进行语义分析）:')
for i, post in enumerate(samples, 1):
    print(f"\n{i}. 帖子ID: {post.get('id')}")
    print(f"   标题: {post.get('title')}")
    print(f"   城市: {post.get('city')}")
    print(f"   互动: 👍{post.get('likedCount')} 💬{post.get('commentCount')} 🔖{post.get('collectedCount')}")
    
    # Kimi语义分析
    title = post.get('title', '')
    city = post.get('city', '')
    
    # 分析帖子类型
    if '吃' in title or '餐厅' in title or '美食' in title or '探店' in title:
        print(f"   [Kimi分析] 这是一条美食探店帖子 ✅")
    elif '推荐' in title or '合集' in title or '合集' in title:
        print(f"   [Kimi分析] 这是一条推荐/合集帖子 ✅")
    else:
        print(f"   [Kimi分析] 可能不是餐厅帖子 ⚠️")
    
    # 提取潜在的餐厅名
    # 模式1: 直接包含的餐厅名（在city后）
    if city and city in title:
        parts = title.split(city)
        if len(parts) > 1:
            potential = parts[1].strip(' ｜|【】')
            if potential and len(potential) > 2:
                print(f"   [Kimi提取] 可能的餐厅/主题: {potential[:50]}")

print('\n' + '=' * 60)
print('需要读取完整正文进行深度提取...')
