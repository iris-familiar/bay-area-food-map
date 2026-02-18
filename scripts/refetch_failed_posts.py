#!/usr/bin/env python3
"""
重新采集30条"失败"的帖子
使用正确的API参数 (feed_id 而不是 note_id)
"""
import json
import subprocess
from pathlib import Path
import time

# 读取失败记录
failed_posts = []
with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/failed_notes.log') as f:
    for line in f:
        note_id = line.strip().split('|')[0]
        failed_posts.append(note_id)

# 读取原始数据获取xsec_token
with open('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/phase1a_search_results.json') as f:
    data = json.load(f)

posts_map = {p['id']: p for p in data.get('posts', [])}

success_count = 0
fail_count = 0

print(f'开始重新采集 {len(failed_posts)} 条"失败"帖子...')
print('=' * 60)

for i, note_id in enumerate(failed_posts, 1):
    post = posts_map.get(note_id)
    if not post:
        print(f'{i}/{len(failed_posts)}: {note_id} - 原始数据不存在')
        fail_count += 1
        continue
    
    token = post.get('xsecToken', '')
    title = post.get('title', 'N/A')[:30]
    
    print(f'{i}/{len(failed_posts)}: {note_id} - {title}...', end=' ')
    
    # 使用正确的参数调用API
    try:
        result = subprocess.run(
            [
                'bash', 
                '/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh',
                'get_feed_detail',
                json.dumps({
                    'feed_id': note_id,
                    'xsec_token': token,
                    'load_all_comments': True
                })
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        response = json.loads(result.stdout)
        
        if 'result' in response:
            # 保存成功获取的数据
            output_file = f'/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts/{note_id}.json'
            with open(output_file, 'w') as f:
                json.dump(response, f, ensure_ascii=False, indent=2)
            
            print('✅ 成功')
            success_count += 1
            
            # 提取评论并保存
            try:
                content_text = response['result']['content'][0]['text']
                data_inner = json.loads(content_text)
                comments = data_inner['data'].get('comments', {}).get('list', [])
                
                if comments:
                    comment_file = f'/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/comments/{note_id}.json'
                    with open(comment_file, 'w') as f:
                        json.dump({
                            'note_id': note_id,
                            'comments': comments,
                            'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ')
                        }, f, ensure_ascii=False, indent=2)
            except:
                pass
        else:
            error_msg = response.get('error', {}).get('message', 'Unknown')
            print(f'❌ 失败: {error_msg}')
            fail_count += 1
            
    except Exception as e:
        print(f'❌ 异常: {e}')
        fail_count += 1
    
    # 控制频率
    time.sleep(2)

print()
print('=' * 60)
print(f'重新采集完成:')
print(f'  成功: {success_count}/{len(failed_posts)}')
print(f'  失败: {fail_count}/{len(failed_posts)}')

# 更新统计
total_posts = len(list(Path('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts/').glob('*.json')))
print(f'\n当前总帖子数: {total_posts}')
