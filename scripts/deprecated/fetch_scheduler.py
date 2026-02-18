#!/usr/bin/env python3
"""
智能去重与调度系统
防止重复抓取，控制抓取节奏
"""

import json
import hashlib
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Set
import time

class DeduplicationStore:
    """去重存储 - 使用SQLite记录已抓取内容"""
    
    def __init__(self, db_path: str = "data/dedup_store.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """初始化数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 已抓取帖子表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS fetched_posts (
                post_id TEXT PRIMARY KEY,
                source_platform TEXT,  -- xiaohongshu, weibo, etc
                content_hash TEXT,      -- 内容指纹
                author_id TEXT,
                title TEXT,
                fetch_time TIMESTAMP,
                fetch_job_id TEXT,      -- 哪次抓取任务
                restaurant_mentions TEXT -- 提到的餐厅ID列表，JSON
            )
        ''')
        
        # 抓取任务日志
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS fetch_jobs (
                job_id TEXT PRIMARY KEY,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                query TEXT,             -- 搜索词
                posts_fetched INTEGER,
                posts_new INTEGER,      -- 实际新增
                posts_duplicate INTEGER, -- 重复数
                status TEXT             -- running, completed, failed
            )
        ''')
        
        # 餐厅追踪表 - 记录上次抓取时间
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS restaurant_tracking (
                restaurant_id TEXT PRIMARY KEY,
                restaurant_name TEXT,
                last_fetch_time TIMESTAMP,
                fetch_count INTEGER DEFAULT 0,
                total_engagement INTEGER,
                priority_score REAL
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def is_duplicate(self, post_id: str, content_hash: str = None) -> bool:
        """检查是否重复"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 检查post_id
        cursor.execute('SELECT 1 FROM fetched_posts WHERE post_id = ?', (post_id,))
        if cursor.fetchone():
            conn.close()
            return True
        
        # 检查内容hash（防止同一个内容不同ID）
        if content_hash:
            cursor.execute('SELECT 1 FROM fetched_posts WHERE content_hash = ?', (content_hash,))
            if cursor.fetchone():
                conn.close()
                return True
        
        conn.close()
        return False
    
    def add_post(self, post_id: str, source: str, title: str, 
                 author_id: str, restaurants: List[str], job_id: str):
        """添加已抓取记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        content_hash = hashlib.md5(title.encode()).hexdigest()
        
        cursor.execute('''
            INSERT OR REPLACE INTO fetched_posts 
            (post_id, source_platform, content_hash, author_id, title, 
             fetch_time, fetch_job_id, restaurant_mentions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (post_id, source, content_hash, author_id, title, 
              datetime.now(), job_id, json.dumps(restaurants)))
        
        conn.commit()
        conn.close()
    
    def get_fetch_stats(self, days: int = 7) -> Dict:
        """获取抓取统计"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        since = datetime.now() - timedelta(days=days)
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(posts_new) as new_posts,
                SUM(posts_duplicate) as dup_posts
            FROM fetch_jobs 
            WHERE start_time > ?
        ''', (since,))
        
        row = cursor.fetchone()
        conn.close()
        
        return {
            "total_jobs": row[0] or 0,
            "new_posts": row[1] or 0,
            "duplicate_posts": row[2] or 0,
            "dedup_rate": (row[2] / (row[1] + row[2]) * 100) if (row[1] + row[2]) > 0 else 0
        }


class FetchScheduler:
    """抓取调度器 - 控制频率和规模"""
    
    # 抓取策略配置
    CONFIG = {
        # 每日限制
        "daily_limit": {
            "max_posts": 50,           # 每天最多抓50个新帖子
            "max_requests": 30,        # 每天最多30次搜索请求
            "max_restaurants": 10      # 每天最多深度追踪10家餐厅
        },
        
        # 请求间隔（秒）- 防封
        "delays": {
            "between_requests": 8,      # 请求间隔8秒
            "between_restaurants": 30,  # 餐厅切换间隔30秒
            "after_error": 60,          # 错误后等待60秒
            "daily_cooldown": 3600      # 达到日限制后冷却1小时
        },
        
        # 单次任务规模
        "batch_size": {
            "posts_per_query": 5,       # 每个搜索词最多取5个帖子
            "queries_per_job": 10,      # 每次任务最多10个搜索词
            "max_depth_per_restaurant": 3  # 每家餐厅最多深度搜索3层
        },
        
        # 餐厅重抓间隔（天）
        "refetch_interval": {
            "trending": 3,      # 热门餐厅3天更新
            "moderate": 7,      # 中等热度7天
            "stable": 14,       # 稳定餐厅14天
            "insufficient": 1   # 数据不足1天
        }
    }
    
    def __init__(self, store: DeduplicationStore):
        self.store = store
        self.today_stats = {"posts": 0, "requests": 0, "restaurants": 0}
    
    def can_fetch_today(self, fetch_type: str = "post") -> bool:
        """检查今日是否还可以抓取"""
        limits = self.CONFIG["daily_limit"]
        
        if fetch_type == "post":
            return self.today_stats["posts"] < limits["max_posts"]
        elif fetch_type == "request":
            return self.today_stats["requests"] < limits["max_requests"]
        elif fetch_type == "restaurant":
            return self.today_stats["restaurants"] < limits["max_restaurants"]
        
        return False
    
    def should_refetch_restaurant(self, restaurant_id: str, 
                                   priority_reason: str) -> bool:
        """判断是否应该重新抓取某餐厅"""
        conn = sqlite3.connect(self.store.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT last_fetch_time FROM restaurant_tracking 
            WHERE restaurant_id = ?
        ''', (restaurant_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row or not row[0]:
            return True  # 从未抓取过
        
        last_fetch = datetime.fromisoformat(row[0])
        days_since = (datetime.now() - last_fetch).days
        
        # 根据优先级决定重抓间隔
        intervals = self.CONFIG["refetch_interval"]
        required_interval = intervals.get(priority_reason, 7)
        
        return days_since >= required_interval
    
    def get_next_batch(self, candidates: List[Dict]) -> List[Dict]:
        """获取下一批可以抓取的餐厅"""
        result = []
        
        for r in candidates:
            # 检查今日额度
            if not self.can_fetch_today("restaurant"):
                break
            
            # 检查是否需要重抓
            if not self.should_refetch_restaurant(r['id'], r.get('priority_reason', 'stable')):
                continue
            
            result.append(r)
            
            # 限制批次大小
            if len(result) >= self.CONFIG["batch_size"]["queries_per_job"]:
                break
        
        return result
    
    def wait_between_requests(self):
        """请求间等待"""
        delay = self.CONFIG["delays"]["between_requests"]
        # 添加随机性 8-12秒
        import random
        actual_delay = delay + random.randint(0, 4)
        time.sleep(actual_delay)
    
    def record_fetch(self, fetch_type: str, count: int = 1):
        """记录本次抓取"""
        if fetch_type in self.today_stats:
            self.today_stats[fetch_type] += count


class AntiDetectionStrategy:
    """反检测策略"""
    
    STRATEGIES = {
        # 时间段伪装 - 模拟正常用户活跃时间
        "time_windows": [
            ("10:00", "12:00"),  # 上午
            ("14:00", "17:00"),  # 下午  
            ("19:00", "22:00"),  # 晚上
        ],
        
        # 随机化请求头
        "user_agents": [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            "Mozilla/5.0 (Linux; Android 14; SM-S918B)",
        ],
        
        # 行为模式 - 模拟人类浏览
        "behavior": {
            "scroll_before_fetch": True,    # 抓取前模拟滚动
            "random_mouse_move": True,      # 随机鼠标移动
            "view_multiple_posts": True,    # 一次看多个帖子
        }
    }
    
    @staticmethod
    def is_in_active_hours() -> bool:
        """检查是否在模拟活跃时间段"""
        from datetime import datetime
        hour = datetime.now().hour
        # 避免凌晨和深夜抓取
        return 9 <= hour <= 23
    
    @staticmethod
    def get_random_delay() -> float:
        """获取随机延迟"""
        import random
        # 正态分布，均值8秒，标准差2秒
        delay = random.gauss(8, 2)
        return max(5, min(15, delay))  # 限制在5-15秒


class FetchPipeline:
    """完整抓取流程控制器"""
    
    def __init__(self):
        self.store = DeduplicationStore()
        self.scheduler = FetchScheduler(self.store)
        self.anti_detect = AntiDetectionStrategy()
    
    def generate_fetch_plan(self, search_plan_path: str) -> Dict:
        """生成可执行的抓取计划"""
        with open(search_plan_path, 'r', encoding='utf-8') as f:
            plan = json.load(f)
        
        executable_plan = {
            "generated_at": datetime.now().isoformat(),
            "total_restaurants": 0,
            "estimated_duration": 0,  # 分钟
            "batches": []
        }
        
        # 按优先级排序
        sorted_restaurants = sorted(
            plan['restaurants'],
            key=lambda x: {'high': 0, 'medium': 1, 'low': 2}[x.get('priority', 'low')]
        )
        
        # 分批处理
        batch_size = self.scheduler.CONFIG["batch_size"]["queries_per_job"]
        current_batch = []
        batch_num = 1
        
        for r in sorted_restaurants:
            # 检查是否需要重抓
            if not self.scheduler.should_refetch_restaurant(
                r['id'], r.get('priority_reason', 'stable')):
                continue
            
            current_batch.append(r)
            
            if len(current_batch) >= batch_size:
                executable_plan["batches"].append({
                    "batch_id": f"batch_{batch_num}",
                    "restaurants": current_batch,
                    "estimated_time": len(current_batch) * 5  # 5分钟每批
                })
                batch_num += 1
                current_batch = []
        
        # 添加最后一批
        if current_batch:
            executable_plan["batches"].append({
                "batch_id": f"batch_{batch_num}",
                "restaurants": current_batch,
                "estimated_time": len(current_batch) * 5
            })
        
        executable_plan["total_restaurants"] = sum(
            len(b["restaurants"]) for b in executable_plan["batches"]
        )
        executable_plan["estimated_duration"] = sum(
            b["estimated_time"] for b in executable_plan["batches"]
        )
        
        return executable_plan
    
    def execute_fetch(self, executable_plan: Dict, dry_run: bool = True):
        """执行抓取（或模拟）"""
        print(f"🚀 抓取计划概览")
        print(f"   餐厅总数: {executable_plan['total_restaurants']}")
        print(f"   分批次数: {len(executable_plan['batches'])}")
        print(f"   预计耗时: {executable_plan['estimated_duration']} 分钟")
        print()
        
        if dry_run:
            print("⚠️  这是模拟运行 (dry-run)")
            print("   实际执行请设置 dry_run=False")
            return
        
        for batch in executable_plan["batches"]:
            print(f"\n📦 执行 {batch['batch_id']}")
            
            for restaurant in batch["restaurants"]:
                # 检查活跃时间
                if not self.anti_detect.is_in_active_hours():
                    print("   ⏸️  非活跃时间，暂停...")
                    time.sleep(3600)  # 等待1小时
                
                # 检查今日额度
                if not self.scheduler.can_fetch_today("restaurant"):
                    print("   🛑 今日额度已满，停止")
                    return
                
                print(f"   🔍 {restaurant['name']}")
                
                # 等待间隔
                self.scheduler.wait_between_requests()
                
                # 这里调用实际抓取脚本
                # fetch_restaurant_data(restaurant)
                
                # 记录
                self.scheduler.record_fetch("restaurant")
                self.scheduler.record_fetch("requests", len(restaurant['search_queries']))


def main():
    """主函数"""
    import sys
    
    search_plan = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not search_plan:
        print("Usage: python3 fetch_scheduler.py <search_plan.json>")
        print()
        print("配置文件:")
        print(json.dumps(FetchScheduler.CONFIG, indent=2, ensure_ascii=False))
        return
    
    pipeline = FetchPipeline()
    executable = pipeline.generate_fetch_plan(search_plan)
    
    # 保存可执行计划
    output_path = search_plan.replace('.json', '_executable.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(executable, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 可执行计划已保存: {output_path}")
    print()
    
    # 模拟执行
    pipeline.execute_fetch(executable, dry_run=True)


if __name__ == "__main__":
    main()
