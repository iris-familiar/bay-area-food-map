#!/usr/bin/env python3
"""
Phase 5: 合并新提取数据到现有v5数据库
并更新统计数据
"""
import json
from pathlib import Path
from datetime import datetime

# 加载现有v5数据库
with open('data/current/restaurant_database_v5_llm_extracted.json') as f:
    existing_db = json.load(f)

# 加载新提取的数据
with open('data/extracted_restaurants_kimi_v3.json') as f:
    new_extractions = json.load(f)

print('='*70)
print('🔄 Phase 5: 合并数据到v5数据库')
print('='*70)

print(f'\n📊 现有数据库: {existing_db["statistics"]["total_restaurants"]} 家餐厅')
print(f'📊 新提取数据: {new_extractions["restaurants_count"]} 家餐厅')

# 创建名称映射，避免重复
existing_names = {r['name'].lower(): r for r in existing_db['restaurants']}

new_count = 0
merged_count = 0

for new_r in new_extractions['restaurants']:
    name = new_r['name']
    name_lower = name.lower()
    
    # 检查是否已存在
    if name_lower in existing_names:
        # 合并数据
        existing = existing_names[name_lower]
        existing['mention_count'] = existing.get('mention_count', 0) + new_r.get('unique_post_count', 1)
        existing['engagement'] = existing.get('engagement', 0) + new_r['engagement'].get('collected', 0)
        
        # 添加上下文
        if 'llmMentions' not in existing:
            existing['llmMentions'] = []
        
        for ctx in new_r.get('contexts', []):
            if ctx and ctx not in [m.get('context', '') for m in existing['llmMentions']]:
                existing['llmMentions'].append({
                    'confidence': 0.85,
                    'context': ctx[:200],
                    'sentiment': 'positive',
                    'source': 'kimi_semantic_v3'
                })
        
        merged_count += 1
    else:
        # 创建新餐厅记录
        max_id = max([int(r['id'][1:]) for r in existing_db['restaurants']])
        new_id = f'r{max_id + new_count + 1:03d}'
        
        # 从上下文提取城市
        city = 'Bay Area'
        for ctx in new_r.get('contexts', []):
            ctx_str = str(ctx)
            for c in ['Cupertino', 'Fremont', 'Sunnyvale', 'Milpitas', 'San Jose']:
                if c in ctx_str:
                    city = c
                    break
        
        # 提取菜品
        dishes = []
        dish_keywords = ['烤鱼', '酸菜鱼', '烤肉', '早茶', '肠粉', '饺子', '面条', '火锅']
        for ctx in new_r.get('contexts', []):
            for dish in dish_keywords:
                if dish in str(ctx) and dish not in dishes:
                    dishes.append(dish)
        
        restaurant = {
            'id': new_id,
            'name': name,
            'nameEn': name,
            'type': '中餐',
            'cuisine': '待确认',
            'area': city,
            'location': city,
            'status': 'candidate',
            'verified': False,
            'price_range': '$$',
            'mention_count': new_r.get('unique_post_count', 1),
            'engagement': new_r['engagement'].get('collected', 0),
            'llmMentions': [{
                'confidence': 0.85,
                'context': ctx[:200] if ctx else f'从帖子中提取: {name}',
                'sentiment': 'positive',
                'source': 'kimi_semantic_v3'
            } for ctx in new_r.get('contexts', [])[:1]],
            'popular_dishes': dishes if dishes else ['特色菜'],
            'sentiment_score': min(new_r['engagement'].get('collected', 0) / 100, 1.0),
            'metrics': {
                'mention_count': new_r.get('unique_post_count', 1),
                'total_engagement': new_r['engagement'].get('collected', 0) + new_r['engagement'].get('comments', 0) * 2
            }
        }
        
        existing_db['restaurants'].append(restaurant)
        existing_names[name_lower] = restaurant
        new_count += 1

# 更新统计数据
existing_db['version'] = '5.2-merged'
existing_db['updated_at'] = datetime.now().isoformat()
existing_db['data_source']['merged_extraction'] = {
    'method': 'Kimi_semantic_v3',
    'restaurants_added': new_count,
    'restaurants_merged': merged_count,
    'merged_at': datetime.now().isoformat()
}

existing_db['statistics']['total_restaurants'] = len(existing_db['restaurants'])

# 保存合并后的数据库
with open('data/current/restaurant_database_v5.json', 'w') as f:
    json.dump(existing_db, f, ensure_ascii=False, indent=2)

print(f'\n✅ 合并完成!')
print(f'   新增餐厅: {new_count} 家')
print(f'   合并更新: {merged_count} 家')
print(f'   总计: {len(existing_db["restaurants"])} 家')
print(f'   保存至: data/current/restaurant_database_v5.json')

# 导出简化版用于UI
print('\n📝 生成UI简化版...')
ui_restaurants = []
for r in existing_db['restaurants']:
    # 计算趋势
    mentions = r.get('mention_count', 0)
    engagement = r.get('engagement', 0)
    
    ui_restaurants.append({
        'id': r['id'],
        'name': r['name'],
        'nameEn': r.get('nameEn', r['name']),
        'cuisine': r.get('cuisine', '待确认'),
        'area': r.get('area', '湾区'),
        'verified': r.get('verified', False),
        'price_range': r.get('price_range', '$$'),
        'sentiment_score': r.get('sentiment_score', 0.7),
        'popular_dishes': r.get('popular_dishes', ['特色菜']),
        'trend_7d': min(mentions * 10, 100),
        'trend_30d': min(engagement // 2, 100),
        'total_engagement': engagement + mentions * 10,
        'mention_count': mentions
    })

# 按互动数排序
ui_restaurants.sort(key=lambda x: x['total_engagement'], reverse=True)

ui_data = {
    'version': '5.2',
    'updated_at': datetime.now().isoformat(),
    'total': len(ui_restaurants),
    'restaurants': ui_restaurants
}

with open('data/current/restaurant_database_v5_ui.json', 'w') as f:
    json.dump(ui_data, f, ensure_ascii=False, indent=2)

print(f'   UI数据已保存: {len(ui_restaurants)} 家餐厅')

print('\n' + '='*70)
print('✅ Phase 5 完成!')
print('='*70)
