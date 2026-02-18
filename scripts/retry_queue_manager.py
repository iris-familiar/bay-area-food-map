#!/usr/bin/env python3
"""
小红书数据采集重试队列系统
管理因API限制暂时失败的帖子，支持定时重试
"""
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
import random

RETRY_QUEUE_FILE = 'data/raw/v2/retry_queue.json'
MAX_RETRY_ATTEMPTS = 5
RETRY_DELAYS = [300, 900, 1800, 3600, 7200]  # 5min, 15min, 30min, 1hr, 2hr

class RetryQueueManager:
    def __init__(self):
        self.queue_file = Path(RETRY_QUEUE_FILE)
        self.queue = self._load_queue()
    
    def _load_queue(self):
        """加载重试队列"""
        if self.queue_file.exists():
            with open(self.queue_file) as f:
                return json.load(f)
        return {'pending': [], 'failed_permanently': [], 'success_history': []}
    
    def _save_queue(self):
        """保存重试队列"""
        with open(self.queue_file, 'w') as f:
            json.dump(self.queue, f, ensure_ascii=False, indent=2)
    
    def add_to_retry(self, note_id, xsec_token, title, failure_reason):
        """添加帖子到重试队列"""
        # 检查是否已在队列中
        for item in self.queue['pending']:
            if item['note_id'] == note_id:
                # 更新重试次数
                item['retry_count'] += 1
                item['last_failure'] = datetime.now().isoformat()
                item['failure_reason'] = failure_reason
                self._save_queue()
                return
        
        # 新添加到队列
        self.queue['pending'].append({
            'note_id': note_id,
            'xsec_token': xsec_token,
            'title': title,
            'failure_reason': failure_reason,
            'retry_count': 0,
            'first_added': datetime.now().isoformat(),
            'last_failure': datetime.now().isoformat(),
            'next_retry': datetime.now().isoformat(),
            'status': 'pending'
        })
        self._save_queue()
        print(f"✅ 已添加到重试队列: {title[:30]} (当前队列: {len(self.queue['pending'])})")
    
    def get_ready_for_retry(self):
        """获取当前可以重试的帖子"""
        now = datetime.now()
        ready = []
        
        for item in self.queue['pending']:
            next_retry = datetime.fromisoformat(item['next_retry'])
            if now >= next_retry and item['retry_count'] < MAX_RETRY_ATTEMPTS:
                ready.append(item)
        
        return ready
    
    def mark_success(self, note_id):
        """标记帖子重试成功"""
        for item in self.queue['pending']:
            if item['note_id'] == note_id:
                item['status'] = 'success'
                item['success_time'] = datetime.now().isoformat()
                self.queue['success_history'].append(item)
                self.queue['pending'].remove(item)
                self._save_queue()
                print(f"✅ 重试成功: {item['title'][:30]}")
                return True
        return False
    
    def mark_retry_failed(self, note_id, failure_reason):
        """标记重试失败，更新下次重试时间"""
        for item in self.queue['pending']:
            if item['note_id'] == note_id:
                item['retry_count'] += 1
                item['last_failure'] = datetime.now().isoformat()
                item['failure_reason'] = failure_reason
                
                # 计算下次重试时间（指数退避 + 随机抖动）
                if item['retry_count'] < len(RETRY_DELAYS):
                    delay = RETRY_DELAYS[item['retry_count'] - 1]
                    delay += random.randint(60, 300)  # 添加1-5分钟随机抖动
                else:
                    delay = RETRY_DELAYS[-1]  # 使用最大延迟
                
                next_retry = datetime.now() + timedelta(seconds=delay)
                item['next_retry'] = next_retry.isoformat()
                
                # 检查是否超过最大重试次数
                if item['retry_count'] >= MAX_RETRY_ATTEMPTS:
                    item['status'] = 'failed_permanently'
                    self.queue['failed_permanently'].append(item)
                    self.queue['pending'].remove(item)
                    print(f"❌ 永久失败（超{MAX_RETRY_ATTEMPTS}次）: {item['title'][:30]}")
                else:
                    print(f"⏳ 第{item['retry_count']}次失败，{delay//60}分钟后重试: {item['title'][:30]}")
                
                self._save_queue()
                return True
        return False
    
    def get_stats(self):
        """获取队列统计"""
        return {
            'pending': len(self.queue['pending']),
            'failed_permanently': len(self.queue['failed_permanently']),
            'success_history': len(self.queue['success_history']),
            'ready_for_retry': len(self.get_ready_for_retry())
        }
    
    def should_process_now(self, note_id):
        """检查帖子是否应该现在处理（避免重复）"""
        # 检查是否已成功
        for item in self.queue['success_history']:
            if item['note_id'] == note_id:
                return False
        
        # 检查是否正在pending但还未到重试时间
        for item in self.queue['pending']:
            if item['note_id'] == note_id:
                next_retry = datetime.fromisoformat(item['next_retry'])
                if datetime.now() < next_retry:
                    return False
        
        return True

def main():
    """测试重试队列管理器"""
    manager = RetryQueueManager()
    
    print("=== 小红书数据采集重试队列系统 ===")
    print()
    
    stats = manager.get_stats()
    print(f"当前队列状态:")
    print(f"  - 待重试: {stats['pending']}")
    print(f"  - 可立即重试: {stats['ready_for_retry']}")
    print(f"  - 永久失败: {stats['failed_permanently']}")
    print(f"  - 历史成功: {stats['success_history']}")
    print()
    
    # 显示待重试的帖子
    ready = manager.get_ready_for_retry()
    if ready:
        print(f"可立即重试的帖子 ({len(ready)}条):")
        for item in ready:
            print(f"  - {item['title'][:40]} (第{item['retry_count']+1}次尝试)")
    else:
        print("没有可立即重试的帖子")

if __name__ == '__main__':
    main()
