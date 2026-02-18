#!/usr/bin/env python3
import json
from pathlib import Path

def parse_mcp_post(filepath):
    with open(filepath) as f:
        wrapper = json.load(f)
    content_text = wrapper['result']['content'][0]['text']
    data = json.loads(content_text)
    note = data['data']['note']
    comments = data['data']['comments']['list']
    return {
        'note_id': note['noteId'],
        'title': note['title'],
        'content': note['desc'],
        'create_time': note['time'],
        'author': note['user']['nickname'],
        'comments_count': len(comments)
    }

posts_dir = Path('data/raw/v2/posts/')
total_posts = 0
total_comments = 0

print('=== 正确解析MCP格式数据 ===')

for f in posts_dir.glob('*.json'):
    try:
        post = parse_mcp_post(f)
        total_posts += 1
        total_comments += post['comments_count']
        if total_posts <= 3:
            print(f"帖子: {post['title'][:40]}")
            print(f"  作者: {post['author']}")
            print(f"  正文: {len(post['content'])} 字符")
            print(f"  评论: {post['comments_count']} 条")
            print()
    except Exception as e:
        print(f'解析失败 {f.name}: {e}')

print('=' * 50)
print(f'总帖子数: {total_posts}')
print(f'总评论数: {total_comments}')
print(f'平均每条帖子评论: {total_comments/total_posts:.1f}')
