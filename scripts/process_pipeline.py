import json
import os
import re
from pathlib import Path
from collections import defaultdict

# 读取所有raw文件
raw_dir = Path('raw')
data_files = sorted(raw_dir.glob('feed_*_detail.json'))

print(f"找到 {len(data_files)} 个数据文件")
print("")

# 餐厅数据库
restaurants = {}
price_mentions = []

# 已知餐厅列表
known_restaurants = [
    {"name": "香锅大王", "name_en": "Sizzling Pot King", "type": "湘菜"},
    {"name": "王家味", "name_en": "Wang Jia Wei", "type": "东北菜"},
    {"name": "Tamarine Restaurant", "name_en": "Tamarine Restaurant & Gallery", "type": "越南菜"},
    {"name": "Shoji", "name_en": "Shoji", "type": "日料"},
    {"name": "Z&Y Restaurant", "name_en": "Z&Y", "type": "川菜"},
    {"name": "Mikiya", "name_en": "Mikiya Wagyu Shabu House", "type": "火锅"},
    {"name": "留湘", "name_en": "Ping's Bistro", "type": "湘菜"},
    {"name": "顾湘", "name_en": "Hometown Kitchen", "type": "湘菜"},
    {"name": "杨裕兴", "name_en": "Yum Noodles", "type": "湘菜"},
]

# 处理每个文件
new_mentions = defaultdict(int)

for file_path in data_files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 提取feed数据
        if 'result' in data and 'content' in data['result']:
            try:
                text_data = data['result']['content'][0]['text']
                feed_data = json.loads(text_data)
            except:
                continue
        else:
            feed_data = data
        
        title = feed_data.get('title', '')
        desc = feed_data.get('desc', '')
        content = title + ' ' + desc
        
        comments = feed_data.get('comments', [])
        
        # 检查已知餐厅的提及
        for restaurant in known_restaurants:
            name = restaurant['name']
            if name in content or restaurant['name_en'] in content:
                new_mentions[name] += 1
        
        # 从评论提取价格信息
        for comment in comments[:50]:
            text = comment.get('content', '')
            
            # 模式1: "2个人150" 
            match1 = re.search(r'(\d+)[个位]人[^\d]*([\d,]+)', text)
            if match1:
                people = int(match1.group(1))
                price = int(match1.group(2).replace(',', ''))
                if people <= 10 and price < 1000:
                    avg = price / people
                    price_mentions.append(avg)
                    print(f"💰 {people}人消费${price} = 人均${avg:.0f}")
                    continue
            
            # 模式2: "人均80"
            match2 = re.search(r'人均[^\d]*([\d,]+)', text)
            if match2:
                avg = int(match2.group(1).replace(',', ''))
                if 10 <= avg <= 200:
                    price_mentions.append(avg)
                    print(f"💰 人均${avg}")
                    
    except Exception as e:
        continue

# 输出统计
print("")
print("=" * 50)
print("📊 统计结果:")
print("=" * 50)

print("\n餐厅提及更新:")
for name, count in sorted(new_mentions.items(), key=lambda x: -x[1]):
    print(f"  - {name}: +{count} 次提及")

if price_mentions:
    avg_price = sum(price_mentions) / len(price_mentions)
    print(f"\n客单价分析:")
    print(f"  样本数: {len(price_mentions)}")
    print(f"  平均客单价: ${avg_price:.0f}")
    print(f"  最低: ${min(price_mentions):.0f}")
    print(f"  最高: ${max(price_mentions):.0f}")

print("")
print("✓ Pipeline 完成!")