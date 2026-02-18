#!/usr/bin/env python3
"""
批量重试采集失败的帖子
使用RetryQueueManager管理重试流程
"""
import json
import subprocess
import time
from pathlib import Path
from retry_queue_manager import RetryQueueManager

def fetch_single_post(note_id, xsec_token):
    """获取单个帖子"""
    try:
        result = subprocess.run(
            [
                'bash',
                '/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh',
                'get_feed_detail',
                json.dumps({
                    'feed_id': note_id,
                    'xsec_token': xsec_token,
                    'load_all_comments': True
                })
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        response = json.loads(result.stdout)
        
        if 'result' in response:
            # 保存成功数据
            output_file = f'/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts/{note_id}.json'
            with open(output_file, 'w') as f:
                json.dump(response, f, ensure_ascii=False, indent=2)
            
            # 提取并保存评论
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
            
            return True, "success"
        else:
            error_msg = response.get('error', {}).get('message', 'Unknown error')
            return False, error_msg
            
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except Exception as e:
        return False, str(e)

def batch_retry():
    """批量重试失败的帖子"""
    manager = RetryQueueManager()
    
    # 获取可以重试的帖子
    ready_items = manager.get_ready_for_retry()
    
    if not ready_items:
        print("没有可立即重试的帖子")
        return
    
    print(f"=== 批量重试采集 ({len(ready_items)}条帖子) ===")
    print()
    
    success_count = 0
    fail_count = 0
    
    for i, item in enumerate(ready_items, 1):
        note_id = item['note_id']
        xsec_token = item['xsec_token']
        title = item['title']
        
        print(f"[{i}/{len(ready_items)}] 重试: {title[:40]}...", end=' ')
        
        success, message = fetch_single_post(note_id, xsec_token)
        
        if success:
            manager.mark_success(note_id)
            success_count += 1
            print("✅ 成功")
        else:
            manager.mark_retry_failed(note_id, message)
            fail_count += 1
            print(f"❌ 失败: {message}")
        
        # 控制频率
        time.sleep(3)
    
    print()
    print("=" * 50)
    print(f"重试完成: 成功{success_count}, 失败{fail_count}")
    
    # 显示队列状态
    stats = manager.get_stats()
    print(f"队列状态: 待重试{stats['pending']}, 可立即重试{stats['ready_for_retry']}, 永久失败{stats['failed_permanently']}")

if __name__ == '__main__':
    batch_retry()
