#!/bin/bash
# 批量采集小红书帖子 - Shell版本

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# 创建目录
mkdir -p data/raw/v2/{posts,comments,authors}

# 获取已采集的帖子
COLLECTED=$(ls data/raw/v2/posts/*.json 2>/dev/null | xargs -I {} basename {} .json | sort)

echo "=================================="
echo "小红书数据采集"
echo "=================================="
echo ""

# 读取所有帖子并处理
cat data/raw/phase1a_search_results.json | python3 -c "
import json
import sys
data = json.load(sys.stdin)
for post in data['posts']:
    print(f\"{post['id']}|{post['xsecToken']}|{post['title'][:40]}\")
" | while IFS='|' read -r NOTE_ID XSEC_TOKEN TITLE; do
    # 检查是否已存在
    if [ -f "data/raw/v2/posts/${NOTE_ID}.json" ]; then
        echo "✓ 已存在: ${TITLE}"
        continue
    fi
    
    echo ""
    echo "采集: ${TITLE}"
    echo "ID: ${NOTE_ID}"
    
    # 调用MCP获取数据
    cd /Users/joeli/.agents/skills/xiaohongshu/scripts
    ./mcp-call.sh get_feed_detail "{\"feed_id\": \"${NOTE_ID}\", \"xsec_token\": \"${XSEC_TOKEN}\", \"load_all_comments\": false, \"limit\": 30}" > /tmp/xhs_${NOTE_ID}.json 2>&1
    
    if [ $? -eq 0 ] && [ -s /tmp/xhs_${NOTE_ID}.json ]; then
        # 处理并保存数据
        cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map
        cat /tmp/xhs_${NOTE_ID}.json | python3 -c "
import json
import sys
from datetime import datetime

data = json.load(sys.stdin)
if 'result' not in data or 'content' not in data['result']:
    sys.exit(1)

content_list = data['result']['content']
if not content_list or 'text' not in content_list[0]:
    sys.exit(1)

try:
    nested = json.loads(content_list[0]['text'])
    note_data = nested['data']['note']
    comments_data = nested['data'].get('comments', {})
    
    post = {
        'note_id': note_data.get('noteId', ''),
        'xsec_token': '${XSEC_TOKEN}',
        'metadata': {
            'title': note_data.get('title', ''),
            'content': note_data.get('desc', ''),
            'create_time': note_data.get('createTime', ''),
            'update_time': note_data.get('updateTime', ''),
            'ip_location': note_data.get('ipLocation', '')
        },
        'author': {
            'user_id': note_data.get('user', {}).get('userId', ''),
            'nickname': note_data.get('user', {}).get('nickname', ''),
            'avatar': note_data.get('user', {}).get('avatar', '')
        },
        'interaction': {
            'liked_count': note_data.get('interactInfo', {}).get('likedCount', 0),
            'collected_count': note_data.get('interactInfo', {}).get('collectedCount', 0),
            'comment_count': note_data.get('interactInfo', {}).get('commentCount', 0),
            'share_count': note_data.get('interactInfo', {}).get('shareCount', 0)
        },
        'tags': [t.get('name', '') for t in note_data.get('tagList', [])],
        'images': note_data.get('imageList', []),
        'fetched_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    comments = []
    for c in comments_data.get('list', []):
        comments.append({
            'comment_id': c.get('commentId', ''),
            'note_id': post['note_id'],
            'parent_id': c.get('parentCommentId', ''),
            'content': c.get('content', ''),
            'create_time': c.get('createTime', ''),
            'author': {
                'user_id': c.get('user', {}).get('userId', ''),
                'nickname': c.get('user', {}).get('nickname', ''),
                'avatar': c.get('user', {}).get('avatar', '')
            },
            'liked_count': c.get('likedCount', 0),
            'sub_comments': c.get('subComments', [])
        })
    
    # 保存帖子
    with open('data/raw/v2/posts/${NOTE_ID}.json', 'w') as f:
        json.dump(post, f, ensure_ascii=False, indent=2)
    
    # 保存评论
    with open('data/raw/v2/comments/${NOTE_ID}.json', 'w') as f:
        json.dump({
            'note_id': '${NOTE_ID}',
            'comments': comments,
            'total_count': len(comments),
            'fetched_at': datetime.utcnow().isoformat() + 'Z'
        }, f, ensure_ascii=False, indent=2)
    
    print(f'✅ 成功 | 评论: {len(comments)}')
    
except Exception as e:
    print(f'❌ 处理失败: {e}')
    sys.exit(1)
" 
        if [ $? -eq 0 ]; then
            echo "✅ 保存成功"
        else
            echo "❌ 处理失败"
        fi
    else
        echo "❌ MCP调用失败"
    fi
    
    # 清理临时文件
    rm -f /tmp/xhs_${NOTE_ID}.json
    
    # 间隔
    sleep 1
done

echo ""
echo "=================================="
echo "采集完成!"
echo "=================================="
echo "帖子数: $(ls data/raw/v2/posts/*.json 2>/dev/null | wc -l)"
echo "评论数: $(ls data/raw/v2/comments/*.json 2>/dev/null | wc -l)"
