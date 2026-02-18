#!/usr/bin/env python3
"""
使用LLM提取推荐菜品
从帖子文本中提取真实的推荐菜品
"""

import json
import os
import subprocess
from pathlib import Path

POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'
DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json'

def call_kimi_for_dishes(text, restaurant_name, title=""):
    """
    使用Kimi提取特定餐厅的推荐菜品
    """
    prompt = f"""你是一个专业的餐厅菜品提取助手。请从以下小红书帖子内容中，提取"{restaurant_name}"这家餐厅的推荐菜品。

帖子标题: {title}

帖子内容:
{text[:3000]}

请仔细阅读帖子，找出关于"{restaurant_name}"的具体菜品推荐信息。注意:
1. 只提取明确提到的菜品（如"推荐XXX"、"必点XXX"、"招牌XXX"）
2. 不要提取泛泛的词（如"牛肉"、"鱼"这种通用词）
3. 如果帖子没有提到具体菜品，返回空数组
4. 最多返回3个最推荐的菜品

请以JSON格式返回:
{{
  "dishes": ["菜品1", "菜品2", "菜品3"]
}}

如果没有具体推荐菜品，返回:
{{
  "dishes": []
}}
"""
    
    try:
        result = subprocess.run(
            ['kimi', 'complete', '--prompt', prompt, '--max-tokens', '1000'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        response = result.stdout.strip()
        
        # 尝试解析JSON
        try:
            data = json.loads(response)
            return data.get('dishes', [])
        except:
            # 尝试从文本中提取JSON
            start = response.find('{')
            end = response.rfind('}') + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
                return data.get('dishes', [])
            return []
            
    except Exception as e:
        print(f"  LLM调用失败: {e}")
        return []

def get_post_text(post_id):
    """获取post的完整文本"""
    filepath = Path(POSTS_DIR) / f"{post_id}.json"
    try:
        with open(filepath) as f:
            wrapper = json.load(f)
        
        # 处理MCP格式
        if 'result' in wrapper and 'content' in wrapper['result']:
            content_text = wrapper['result']['content'][0]['text']
            data = json.loads(content_text)
            note = data['data']['note']
        else:
            note = wrapper.get('data', {}).get('note', {})
        
        title = note.get('title', '')
        desc = note.get('desc', '')
        return title + '\n' + desc
    except:
        return ""

def main():
    # 加载数据库
    with open(DB_FILE, 'r') as f:
        db = json.load(f)
    
    print('🤖 使用LLM提取推荐菜品')
    print('=' * 70)
    
    # 只测试前2家餐厅
    test_restaurants = [r for r in db['restaurants'] if r.get('sources') and len(r['sources']) > 0][:2]
    
    for i, r in enumerate(test_restaurants):
        print(f"\n{i+1}/{len(test_restaurants)}: {r['name']}")
        
        # 收集所有相关post的文本
        all_texts = []
        for source_id in r['sources']:
            text = get_post_text(source_id)
            if text:
                all_texts.append(text)
        
        if not all_texts:
            print("  无文本内容")
            continue
        
        # 合并文本（限制长度）
        combined_text = '\n---\n'.join(all_texts)[:4000]
        title = all_texts[0].split('\n')[0] if all_texts else ""
        
        # 调用LLM提取推荐菜
        dishes = call_kimi_for_dishes(combined_text, r['name'], title)
        
        if dishes:
            r['recommendations'] = dishes
            r['recommendations_source'] = 'llm_extracted'
            print(f"  ✅ 提取到: {', '.join(dishes)}")
        else:
            print(f"  ⚠️  无具体推荐菜品")
    
    # 保存
    with open(DB_FILE, 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    with open(DB_FILE.replace('.json', '_v5_ui.json'), 'w') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    print('\n' + '=' * 70)
    print('✅ LLM提取完成')

if __name__ == '__main__':
    main()
