#!/usr/bin/env python3
"""
获取Google Maps URL
使用goplaces details API获取每个地点的maps url
"""

import json
import subprocess
import time

DB_FILE = './data/current/restaurant_database.json'

with open(DB_FILE, 'r') as f:
    db = json.load(f)

print('🔗 获取Google Maps URL')
print('=' * 70)

updated = 0

for i, r in enumerate(db['restaurants']):
    if not r.get('google_place_id'):
        continue
    
    place_id = r['google_place_id']
    print(f"\n{i+1}/{len(db['restaurants'])}: {r['name']}")
    
    try:
        # 使用goplaces details获取URL
        result = subprocess.run(
            ['goplaces', 'details', place_id, '--json'],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            # 查找url字段
            if isinstance(data, dict):
                url = data.get('url') or data.get('google_maps_url')
                if url:
                    r['google_maps_url'] = url
                    print(f"  ✅ URL: {url[:60]}...")
                    updated += 1
                else:
                    print(f"  ⚠️  无URL字段")
                    # 使用备用格式
                    r['google_maps_url'] = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            else:
                print(f"  ⚠️  数据格式错误")
                r['google_maps_url'] = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        else:
            print(f"  ❌ API调用失败")
            r['google_maps_url'] = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        r['google_maps_url'] = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    
    time.sleep(0.5)

# 保存
with open(DB_FILE, 'w') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

with open(DB_FILE.replace('.json', '_v5_ui.json'), 'w') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 70)
print(f'✅ 已更新 {updated} 家餐厅的Google Maps URL')
