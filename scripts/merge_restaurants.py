#!/usr/bin/env python3
"""
合并提取结果 - 原有15家 + 新提取的餐厅
"""
import json

# 读取原有15家
with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v5_ui.json', 'r') as f:
    original = json.load(f)

# 读取LLM提取的
with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json', 'r') as f:
    llm = json.load(f)

# 原有餐厅名集合
original_names = {r['name'].lower().replace(' ', '') for r in original['restaurants']}

# 新餐厅（去重）
new_restaurants = []
for r in llm['restaurants']:
    key = r['name'].lower().replace(' ', '')
    # 检查是否与原有餐厅重复
    is_duplicate = False
    for orig_name in original_names:
        if key in orig_name or orig_name in key:
            is_duplicate = True
            break
    
    if not is_duplicate:
        new_restaurants.append(r)

print(f"原有餐厅: {len(original['restaurants'])} 家")
print(f"LLM提取: {len(llm['restaurants'])} 家")
print(f"去重后新餐厅: {len(new_restaurants)} 家")

# 合并
all_restaurants = original['restaurants'] + new_restaurants

# 重新编号
for i, r in enumerate(all_restaurants, 1):
    r['id'] = f'r{i:03d}'

# 按讨论度排序
all_restaurants.sort(key=lambda x: x.get('total_engagement', 0), reverse=True)

print(f"\n合并后总共: {len(all_restaurants)} 家餐厅")
print("\n按讨论度排序:")
for i, r in enumerate(all_restaurants[:50], 1):
    area = r.get('area', '?')
    cuisine = r.get('cuisine', '?')
    engagement = r.get('total_engagement', 0)
    mentions = r.get('mention_count', 0)
    print(f"{i:2d}. {r['name']:25s} | {cuisine:12s} | {area:15s} | {engagement:5d} ({mentions}次)")

import re

def clean_text(text):
    """清理文本中的emoji和非法字符"""
    if isinstance(text, str):
        # 移除emoji
        emoji_pattern = re.compile("["
            u"\U0001F600-\U0001F64F"  # emoticons
            u"\U0001F300-\U0001F5FF"  # symbols & pictographs
            u"\U0001F680-\U0001F6FF"  # transport & map symbols
            u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
            u"\U00002702-\U000027B0"
            u"\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE)
        text = emoji_pattern.sub(r'', text)
        # 替换 surrogates
        text = text.encode('utf-8', 'ignore').decode('utf-8')
    return text

def clean_restaurant(r):
    """清理餐厅数据"""
    r['name'] = clean_text(r.get('name', ''))
    r['cuisine'] = clean_text(r.get('cuisine', ''))
    r['area'] = clean_text(r.get('area', ''))
    if 'post_title' in r:
        r['post_title'] = clean_text(r['post_title'])
    if 'post_details' in r:
        for pd in r['post_details']:
            pd['title'] = clean_text(pd.get('title', ''))
    return r

# 清理所有餐厅数据
for r in all_restaurants:
    clean_restaurant(r)

# 保存
output = {
    'version': '8.0-merged',
    'total_restaurants': len(all_restaurants),
    'restaurants': all_restaurants
}

with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_merged.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\n💾 合并结果已保存到 restaurant_database_merged.json")
