#!/usr/bin/env python3
"""
Google Places 验证 - Python版本
使用subprocess直接调用goplaces
"""

import json
import subprocess
import time
import sys

def search_place(name, city):
    """搜索餐厅"""
    query = f"{name} {city}, CA"
    
    try:
        result = subprocess.run(
            ['goplaces', 'search', query, '--limit', '1', '--json'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            if data.get('results'):
                return data['results'][0]
    except Exception as e:
        print(f"   错误: {e}")
    
    return None

def main():
    # 读取数据库
    with open('data/current/restaurant_database.json', 'r') as f:
        db = json.load(f)
    
    print('🔍 Google Places 验证 (Python)')
    print('=' * 70)
    
    success = 0
    fail = 0
    
    # 验证前30家
    for i, r in enumerate(db['restaurants'][:30]):
        city = r.get('area', 'Bay Area')
        
        print(f"\n{i+1}/30: {r['name']} ({city})")
        
        place = search_place(r['name'], city)
        
        if place:
            print(f"   ✅ 找到: {place['name']}")
            print(f"   📍 地址: {place['address'][:50]}...")
            print(f"   ⭐ 评分: {place['rating']}")
            
            # 保存真实数据
            r['google_place_id'] = place['place_id']
            r['google_name'] = place['name']
            r['google_rating'] = place['rating']
            r['address'] = place['address']
            r['verified'] = True
            r['location'] = place.get('location', {})
            
            success += 1
        else:
            print(f"   ❌ 未找到")
            r['verified'] = False
            fail += 1
        
        time.sleep(1)
    
    print('\n' + '=' * 70)
    print(f'验证完成: {success} 成功, {fail} 失败')
    
    # 保存
    with open('data/current/restaurant_database.json', 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    with open('data/current/restaurant_database_v5_ui.json', 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    print('\n💾 已保存')

if __name__ == '__main__':
    main()
