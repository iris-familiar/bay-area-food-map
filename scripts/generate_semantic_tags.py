#!/usr/bin/env python3
"""
使用LLM为餐厅生成Semantic Tags
从帖子内容分析餐厅的场景、氛围、实用特征
"""

import json
import subprocess
from pathlib import Path

DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json'
POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'

def load_post(post_id):
    """加载post文件"""
    try:
        filepath = Path(POSTS_DIR) / f"{post_id}.json"
        with open(filepath) as f:
            wrapper = json.load(f)
        
        if 'result' in wrapper and 'content' in wrapper['result']:
            content_text = wrapper['result']['content'][0]['text']
            data = json.loads(content_text)
            return data['data']
        return wrapper.get('data')
    except:
        return None

def get_post_texts(restaurant):
    """获取餐厅相关的所有帖子文本"""
    texts = []
    for source_id in restaurant.get('sources', []):
        post = load_post(source_id)
        if post and post.get('note'):
            title = post['note'].get('title', '')
            desc = post['note'].get('desc', '')
            texts.append(f"{title}\n{desc}")
    return texts

def call_kimi_for_tags(restaurant_name, cuisine, texts):
    """调用Kimi生成semantic tags"""
    combined_text = '\n---\n'.join(texts)[:3000]
    
    prompt = f"""分析以下关于餐厅"{restaurant_name}"({cuisine})的小红书帖子，提取semantic tags。

帖子内容:
{combined_text}

请从以下维度分析，返回JSON格式:
{{
  "scenes": ["场景标签"],  // 可选: date-night(约会), group-dining(聚餐), family-friendly(亲子), solo-dining(一人食), business(商务)
  "vibes": ["氛围标签"],    // 可选: quiet(安静), lively(热闹), fancy(高档), authentic(正宗), cozy(温馨), casual(休闲)
  "practical": ["实用标签"] // 可选: budget(实惠), spicy(辣味), parking(好停车), no-wait(不排队), healthy(健康)
}}

分析指南:
- 约会场景: 提到"约会"、"浪漫"、"情侣"
- 聚餐场景: 提到"聚餐"、"聚会"、"朋友"
- 亲子场景: 提到"带孩子"、"家庭"、"小朋友"
- 安静氛围: 提到"安静"、"私密"
- 热闹氛围: 提到"热闹"、"烟火气"
- 高档: 提到"高档"、"精致"、价格贵
- 正宗: 提到"正宗"、"地道"、"家乡味"
- 实惠: 提到"便宜"、"划算"、"性价比"
- 辣味: 提到"辣"、"麻辣"、" spicy"

如果没有明显特征，返回空数组。

只返回JSON，不要其他文字。"""
    
    try:
        result = subprocess.run(
            ['kimi', 'complete', '--prompt', prompt, '--max-tokens', '1000'],
            capture_output=True, text=True, timeout=60
        )
        
        response = result.stdout.strip()
        
        # 解析JSON
        try:
            data = json.loads(response)
            return {
                'scenes': data.get('scenes', []),
                'vibes': data.get('vibes', []),
                'practical': data.get('practical', [])
            }
        except:
            # 尝试从文本中提取JSON
            start = response.find('{')
            end = response.rfind('}') + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                return {
                    'scenes': data.get('scenes', []),
                    'vibes': data.get('vibes', []),
                    'practical': data.get('practical', [])
                }
            return {'scenes': [], 'vibes': [], 'practical': []}
    except Exception as e:
        print(f"    LLM调用失败: {e}")
        return {'scenes': [], 'vibes': [], 'practical': []}

def main():
    # 加载数据库
    with open(DB_FILE, 'r') as f:
        db = json.load(f)
    
    print('🏷️  使用LLM生成Semantic Tags')
    print('=' * 70)
    
    updated = 0
    
    for i, r in enumerate(db['restaurants']):
        # 如果已有tags且不为空，跳过
        if r.get('semantic_tags') and (r['semantic_tags'].get('scenes') or r['semantic_tags'].get('vibes')):
            print(f"{i+1}/{len(db['restaurants'])}: {r['name']} - 已有tags，跳过")
            continue
        
        print(f"\n{i+1}/{len(db['restaurants'])}: {r['name']}")
        
        # 获取帖子文本
        texts = get_post_texts(r)
        if not texts:
            print(f"    无帖子文本，跳过")
            continue
        
        # 调用LLM生成tags
        tags = call_kimi_for_tags(r['name'], r.get('cuisine', ''), texts)
        
        if tags['scenes'] or tags['vibes'] or tags['practical']:
            r['semantic_tags'] = tags
            print(f"    ✅ tags: {json.dumps(tags, ensure_ascii=False)}")
            updated += 1
        else:
            print(f"    ⚠️  未提取到tags")
            r['semantic_tags'] = {'scenes': [], 'vibes': [], 'practical': []}
        
        # 每5个休息
        if (i + 1) % 5 == 0:
            print(f"\n    (休息5秒...)")
            import time
            time.sleep(5)
    
    # 保存
    with open(DB_FILE, 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    with open(DB_FILE.replace('.json', '_v5_ui.json'), 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    print('\n' + '=' * 70)
    print(f'✅ 完成! 更新了 {updated}/{len(db["restaurants"])} 家餐厅的semantic tags')
    
    # 统计
    with_tags = sum(1 for r in db['restaurants'] if r.get('semantic_tags') and (r['semantic_tags'].get('scenes') or r['semantic_tags'].get('vibes')))
    print(f'   有tags的餐厅: {with_tags}/{len(db["restaurants"])}')

if __name__ == '__main__':
    main()
