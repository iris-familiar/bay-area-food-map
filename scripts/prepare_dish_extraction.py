#!/usr/bin/env python3
"""
使用LLM提取推荐菜品 - 测试版
调用OpenClaw的agent能力
"""

import json
import os
from pathlib import Path

POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts'

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
    # 只测试留湘小聚
    sources = ['693e02ff000000001e038ae4', '67f363f0000000001c01ecd5', '690c40bf0000000005039eae', '66667292000000000f00f266', '67ba7dae00000000290119d8']
    
    print('🤖 准备提取推荐菜品测试')
    print('=' * 70)
    print('')
    print('餐厅: 留湘小聚')
    print('')
    
    all_texts = []
    for i, source_id in enumerate(sources, 1):
        text = get_post_text(source_id)
        if text:
            print(f'{i}. {source_id}')
            title = text.split('\n')[0]
            print(f'   标题: {title}')
            print(f'   内容长度: {len(text)} chars')
            print('')
            all_texts.append(text)
    
    print('=' * 70)
    print('')
    print('请用以下prompt调用Kimi提取推荐菜品:')
    print('')
    print('```')
    print('从以下小红书帖子内容中，提取"留湘小聚"这家餐厅的推荐菜品。')
    print('')
    print('注意:')
    print('1. 只提取明确提到的菜品（如"推荐XXX"、"必点XXX"、"招牌XXX"）')
    print('2. 不要提取泛泛的词（如"牛肉"、"鱼"这种通用词）')
    print('3. 最多返回3个最推荐的菜品')
    print('4. 如果没有具体推荐，返回空数组')
    print('')
    print('请以JSON格式返回: {"dishes": ["菜品1", "菜品2", "菜品3"]}')
    print('```')
    print('')
    print(f'帖子内容已保存到 /tmp/liuxiang_posts.txt，共 {len(all_texts)} 个帖子')
    
    # 保存到文件
    with open('/tmp/liuxiang_posts.txt', 'w') as f:
        for i, text in enumerate(all_texts, 1):
            f.write(f'=== 帖子 {i} ===\n')
            f.write(text[:1500])  # 限制长度
            f.write('\n\n')

if __name__ == '__main__':
    main()
