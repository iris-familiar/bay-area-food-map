#!/usr/bin/env python3
import json
import re
from collections import defaultdict

with open('data/raw/phase1a_search_results.json') as f:
    data = json.load(f)

posts = data.get('posts', [])
print(f'🤖 基于{len(posts)}条帖子标题进行语义提取...')
print('=' * 70)

# 存储提取的餐厅
extracted_restaurants = defaultdict(lambda: {
    'mentions': [],
    'total_engagement': 0,
    'cities': set(),
    'confidence': 0
})

for post in posts:
    post_id = post.get('id')
    title = post.get('title', '')
    city = post.get('city', '')
    engagement = int(post.get('likedCount', 0)) + int(post.get('commentCount', 0)) + int(post.get('collectedCount', 0))
    
    # Kimi语义分析：从标题提取餐厅名
    # 模式1: "城市｜XXX" - XXX是餐厅名或主题
    if '｜' in title:
        parts = title.split('｜')
        if len(parts) >= 2:
            potential = parts[1].strip()
            # 清理emoji和符号
            clean = re.sub(r'[🍱🥘🍜🍤🔥🧨😋🐎【】]+', ' ', potential).strip()
            if clean and len(clean) > 2:
                # 判断是否包含餐厅名（语义判断）
                if any(keyword in clean for keyword in ['餐厅', '店', '馆', '屋', '家', '食堂', '厨房']):
                    restaurant_name = clean.split()[0] if ' ' in clean else clean
                    print(f'\n📍 提取餐厅: {restaurant_name}')
                    print(f'   来源标题: {title[:60]}')
                    print(f'   城市: {city}')
                    liked = post.get('likedCount', 0)
                    comment = post.get('commentCount', 0)
                    collected = post.get('collectedCount', 0)
                    print(f'   互动: 👍{liked} 💬{comment} 🔖{collected}')
                    
                    extracted_restaurants[restaurant_name]['mentions'].append({
                        'post_id': post_id,
                        'context': title,
                        'engagement': engagement
                    })
                    extracted_restaurants[restaurant_name]['total_engagement'] += engagement
                    extracted_restaurants[restaurant_name]['cities'].add(city)

# 统计
print(f'\n{"="*70}')
print(f'✅ 从标题中提取了 {len(extracted_restaurants)} 家餐厅候选')
print(f'\nTop 10 按讨论度排序:')
sorted_restaurants = sorted(extracted_restaurants.items(), 
                            key=lambda x: x[1]['total_engagement'], 
                            reverse=True)[:10]

for name, info in sorted_restaurants:
    cities = ', '.join(info['cities'])
    mentions = len(info['mentions'])
    eng = info['total_engagement']
    print(f'  {name} ({cities}): {eng} 互动, {mentions} 次提及')

# 保存结果
result = {
    'extracted_from': 'title_semantic_analysis',
    'total_posts': len(posts),
    'total_restaurants': len(extracted_restaurants),
    'restaurants': [
        {
            'name': name,
            'cities': list(info['cities']),
            'total_engagement': info['total_engagement'],
            'mention_count': len(info['mentions']),
            'confidence': 'medium'  # 基于标题的置信度中等
        }
        for name, info in sorted_restaurants
    ]
}

with open('data/extracted_from_titles_kimi.json', 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'\n💾 结果已保存到 data/extracted_from_titles_kimi.json')
