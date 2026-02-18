#!/usr/bin/env python3
"""
修复坐标数据 - 为已有餐厅补充Google Maps坐标
"""

import json
import subprocess
import time
from pathlib import Path

def get_place_from_google(name, address):
    """使用goplaces获取坐标"""
    try:
        # 构建搜索词
        search_term = f"{name} {address}"
        
        # 调用goplaces
        result = subprocess.run(
            ["goplaces", "autocomplete", search_term],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return None
            
        data = json.loads(result.stdout)
        if data and len(data) > 0:
            place = data[0]
            # 获取详情
            place_id = place.get('place_id')
            if place_id:
                # 获取详细坐标
                detail_result = subprocess.run(
                    ["curl", "-s", f"https://places.googleapis.com/v1/places/{place_id}?fields=location&key=${GOOGLE_PLACES_API_KEY}"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if detail_result.returncode == 0:
                    detail = json.loads(detail_result.stdout)
                    loc = detail.get('location', {})
                    return {
                        'lat': loc.get('latitude'),
                        'lng': loc.get('longitude'),
                        'place_id': place_id
                    }
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

def fix_coordinates():
    """修复所有缺失坐标的餐厅"""
    db_path = Path("data/current/restaurant_database.json")
    
    with open(db_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
    
    restaurants = db.get('restaurants', [])
    fixed_count = 0
    failed_count = 0
    
    print("🔧 开始修复坐标数据...")
    print("=" * 60)
    
    for r in restaurants:
        if r.get('coordinates'):
            continue  # 已有坐标，跳过
            
        name = r.get('name', '')
        address = r.get('address', '')
        location = r.get('location', '')
        
        print(f"\n📍 {name}")
        print(f"   地址: {address or location}")
        
        # 尝试获取坐标
        coords = get_place_from_google(name, address or location)
        
        if coords:
            r['coordinates'] = {
                'lat': coords['lat'],
                'lng': coords['lng']
            }
            if not r.get('google_place_id') and coords.get('place_id'):
                r['google_place_id'] = coords['place_id']
            print(f"   ✅ 已修复: {coords['lat']:.6f}, {coords['lng']:.6f}")
            fixed_count += 1
        else:
            print(f"   ⚠️  无法获取坐标")
            failed_count += 1
        
        # 防封延迟
        time.sleep(1)
    
    # 保存
    with open(db_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    
    print("\n" + "=" * 60)
    print(f"✅ 修复完成: {fixed_count} 家")
    print(f"⚠️  失败: {failed_count} 家")
    print(f"📁 已保存: {db_path}")

if __name__ == "__main__":
    import os
    if not os.environ.get('GOOGLE_PLACES_API_KEY'):
        print("⚠️  需要 GOOGLE_PLACES_API_KEY 环境变量")
        exit(1)
    
    fix_coordinates()
