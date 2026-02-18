#!/usr/bin/env python3
"""
Phase 1B: 提取高互动帖子并准备获取详情
"""

import json
from pathlib import Path

# 读取搜索结果
with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/phase1a_search_results.json', 'r') as f:
    data = json.load(f)

posts = data['posts']

# 筛选高互动帖子 (点赞>100 或 评论>30 或 收藏>200)
high_interaction_posts = []
for post in posts:
    liked = int(post['likedCount'])
    comments = int(post['commentCount'])
    collected = int(post['collectedCount'])
    
    if liked > 100 or comments > 30 or collected > 200:
        high_interaction_posts.append({
            'id': post['id'],
            'xsecToken': post['xsecToken'],
            'title': post['title'],
            'city': post['city'],
            'likedCount': liked,
            'commentCount': comments,
            'collectedCount': collected,
            'priority': liked + comments * 2 + collected * 0.5  # 综合权重
        })

# 按优先级排序
high_interaction_posts.sort(key=lambda x: x['priority'], reverse=True)

print(f"📊 高互动帖子筛选结果 (共 {len(high_interaction_posts)} 个):\n")
print("=" * 80)

for i, post in enumerate(high_interaction_posts[:15], 1):
    print(f"\n{i}. {post['title'][:50]}")
    print(f"   城市: {post['city']} | 👍 {post['likedCount']} | 💬 {post['commentCount']} | 🔖 {post['collectedCount']}")
    print(f"   ID: {post['id']}")
    print(f"   Token: {post['xsecToken'][:50]}...")

# 保存高互动帖子列表
output_file = Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/high_interaction_posts.json')
with open(output_file, 'w') as f:
    json.dump({
        'total': len(high_interaction_posts),
        'posts': high_interaction_posts
    }, f, indent=2, ensure_ascii=False)

print(f"\n💾 已保存到: {output_file}")

# 生成获取详情的命令
print("\n" + "=" * 80)
print("📝 获取帖子详情的命令 (逐个执行，间隔15秒):\n")
for i, post in enumerate(high_interaction_posts[:10], 1):
    print(f"# {i}. {post['title'][:40]}...")
    print(f"cd /Users/joeli/.agents/skills/xiaohongshu/scripts && ./post-detail.sh '{post['id']}' '{post['xsecToken']}' > /tmp/post_{i}.json 2>&1")
    print(f"sleep 15")
    print()
