#!/bin/bash
# 批量采集小红书帖子 - 修复版（正确处理评论ID）

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# 创建目录
mkdir -p data/raw/v2/{posts,comments,authors}

echo "=================================="
echo "小红书数据采集 - 修复版"
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
        # 处理并保存数据（修复版）
        cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map
        cat /tmp/xhs_${NOTE_ID}.json | python3 << 'PYEOF'
import json
import sys
from datetime import datetime, timezone

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
    
    # 处理帖子
    post = {
        'note_id': note_data.get('noteId', ''),
        'xsec_token': XSEC_TOKEN,
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
        'fetched_at': datetime.now(timezone.utc).isoformat()
    }
    
    # 处理评论（修复版 - 正确处理ID字段）
    comments = []
    for c in comments_data.get('list', []):
        # 主评论ID使用 'id' 字段
        main_comment_id = c.get('id', '')
        
        comment = {
            'comment_id': main_comment_id,
            'note_id': c.get('noteId', ''),
            'parent_id': c.get('parentCommentId', ''),  # 主评论通常为空
            'root_comment_id': main_comment_id,  # 主评论自己是根
            'content': c.get('content', ''),
            'create_time': c.get('createTime', ''),
            'author': {
                'user_id': c.get('userInfo', {}).get('userId', ''),
                'nickname': c.get('userInfo', {}).get('nickname', ''),
                'avatar': c.get('userInfo', {}).get('avatar', '')
            },
            'interaction': {
                'liked_count': int(c.get('likeCount', 0) or 0),
                'reply_count': int(c.get('subCommentCount', 0) or 0)
            },
            'sub_comments': []
        }
        
        # 处理子评论
        for sub in c.get('subComments', []):
            sub_comment = {
                'comment_id': sub.get('id', ''),
                'parent_id': main_comment_id,  # 父评论是主评论
                'root_comment_id': main_comment_id,  # 根评论是主评论
                'content': sub.get('content', ''),
                'create_time': sub.get('createTime', ''),
                'author': {
                    'user_id': sub.get('userInfo', {}).get('userId', ''),
                    'nickname': sub.get('userInfo', {}).get('nickname', ''),
                    'avatar': sub.get('userInfo', {}).get('avatar', '')
                },
                'interaction': {
                    'liked_count': int(sub.get('likeCount', 0) or 0)
                }
            }
            comment['sub_comments'].append(sub_comment)
        
        comments.append(comment)
    
    # 保存帖子
    with open('data/raw/v2/posts/' + note_id + '.json', 'w') as f:
        json.dump(post, f, ensure_ascii=False, indent=2)
    
    # 保存评论
    with open('data/raw/v2/comments/' + note_id + '.json', 'w') as f:
        json.dump({
            'note_id': note_id,
            'comments': comments,
            'total_count': len(comments),
            'fetched_at': datetime.now(timezone.utc).isoformat()
        }, f, ensure_ascii=False, indent=2)
    
    print(f'✅ 成功 | 评论: {len(comments)}')
    
except Exception as e:
    print(f'❌ 处理失败: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYEOF
        if [ $? -eq 0 ]; then
            echo "✅ 保存成功"
        else
            echo "❌ 处理失败"
        fi
    else
        echo "❌ MCP调用失败或返回空"
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
