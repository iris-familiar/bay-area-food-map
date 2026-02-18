#!/usr/bin/env python3
"""
小红书帖子质量过滤器
根据质量评分系统筛选高质量帖子
"""

import json
import re
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple

class PostQualityFilter:
    """帖子质量过滤器"""
    
    # 广告/垃圾关键词
    SPAM_KEYWORDS = [
        '免费领取', '点击链接', '加我微信', '私信我', '联系我',
        '限时优惠', '扫码', '折扣码', '代购', '代理',
        '绝对好吃', '最好吃没有之一', '必吃', '神仙', '绝绝子',
        '免费', '赠送', '试用', '活动', '优惠'
    ]
    
    # 可疑模式
    SUSPICIOUS_PATTERNS = [
        re.compile(r'\$+\d+'),  # 大量金钱符号
        re.compile(r'[Vv]信|微信|wechat', re.I),  # 微信引流
        re.compile(r'.{0,10}https?://'),  # 早期插入链接
        re.compile(r'[0-9a-zA-Z]{10,}'),  # 随机码
    ]
    
    def __init__(self, 
                 min_comments: int = 5,
                 min_desc_length: int = 50,
                 min_quality_score: float = 40.0,
                 max_age_days: int = 730):
        self.min_comments = min_comments
        self.min_desc_length = min_desc_length
        self.min_quality_score = min_quality_score
        self.max_age_days = max_age_days
        
        self.stats = {
            'total': 0,
            'passed': 0,
            'filtered': 0,
            'filter_reasons': {}
        }
    
    def calculate_quality_score(self, feed_data: Dict) -> float:
        """计算帖子质量评分 (0-100)"""
        score = 0.0
        interact = feed_data.get('interactInfo', {})
        author = feed_data.get('author', {})
        desc = feed_data.get('desc', '')
        
        # 1. 互动指标 (40分)
        liked_count = interact.get('likedCount', 0)
        comment_count = interact.get('commentCount', 0)
        collected_count = interact.get('collectedCount', 0)
        
        score += min(liked_count / 10, 15)  # 点赞，最高15
        score += min(comment_count * 2, 15)  # 评论，每条2分，最高15
        score += min(collected_count / 2, 10)  # 收藏，最高10
        
        # 2. 内容深度 (30分)
        desc_length = len(desc)
        score += min(desc_length / 30, 15)  # 描述长度，最高15
        
        image_count = len(feed_data.get('imageList', []))
        score += min(image_count * 2, 10)  # 图片数，最高10
        
        if feed_data.get('title'):
            score += 5  # 有标题
        
        # 3. 作者可信度 (20分)
        follow_count = author.get('followCount', 0)
        if follow_count > 1000:
            score += 10
        elif follow_count > 100:
            score += 5
        
        favorited_count = author.get('totalFavorited', 0)
        if favorited_count > 10000:
            score += 10
        elif favorited_count > 1000:
            score += 5
        
        # 4. 时效性 (10分)
        create_time = feed_data.get('createTime', 0)
        if create_time:
            days_ago = (datetime.now().timestamp() * 1000 - create_time) / 86400000
            if days_ago < 30:
                score += 10
            elif days_ago < 90:
                score += 7
            elif days_ago < 180:
                score += 5
            elif days_ago < 365:
                score += 3
        
        return min(score, 100)
    
    def is_spam_post(self, feed_data: Dict) -> Tuple[bool, str]:
        """
        检测是否为垃圾/广告帖子
        返回: (is_spam, reason)
        """
        title = feed_data.get('title', '')
        desc = feed_data.get('desc', '')
        text = (title + ' ' + desc).lower()
        interact = feed_data.get('interactInfo', {})
        
        # 1. 关键词检测
        keyword_matches = [k for k in self.SPAM_KEYWORDS if k.lower() in text]
        if len(keyword_matches) >= 3:
            return True, f"过多广告关键词: {', '.join(keyword_matches[:3])}"
        
        # 2. 模式检测
        for pattern in self.SUSPICIOUS_PATTERNS:
            if pattern.search(text):
                return True, f"可疑模式: {pattern.pattern[:30]}..."
        
        # 3. 互动异常检测 (点赞极高但评论极少)
        liked_count = interact.get('likedCount', 0)
        comment_count = interact.get('commentCount', 0)
        if comment_count < 3 and liked_count > 1000:
            return True, "互动异常: 点赞极高但评论极少"
        
        # 4. 内容过短检测
        if len(desc) < 20 and len(title) < 10:
            return True, "内容过短，可能是水贴"
        
        return False, ""
    
    def check_hard_filters(self, feed_data: Dict) -> Tuple[bool, str]:
        """
        硬性过滤条件
        返回: (pass, reason_if_failed)
        """
        interact = feed_data.get('interactInfo', {})
        desc = feed_data.get('desc', '')
        create_time = feed_data.get('createTime', 0)
        
        # 1. 评论数检查
        comment_count = interact.get('commentCount', 0)
        if comment_count < self.min_comments:
            return False, f"评论数不足: {comment_count} < {self.min_comments}"
        
        # 2. 描述长度检查
        if len(desc) < self.min_desc_length:
            return False, f"描述过短: {len(desc)} < {self.min_desc_length}"
        
        # 3. 时效性检查
        if create_time:
            days_ago = (datetime.now().timestamp() * 1000 - create_time) / 86400000
            if days_ago > self.max_age_days:
                return False, f"内容过期: {int(days_ago)}天 > {self.max_age_days}天"
        
        return True, ""
    
    def filter_feed(self, feed_data: Dict) -> Tuple[bool, Dict]:
        """
        过滤单个feed
        返回: (should_keep, quality_info)
        """
        self.stats['total'] += 1
        
        # 1. 硬性过滤
        passed, reason = self.check_hard_filters(feed_data)
        if not passed:
            self.stats['filtered'] += 1
            self.stats['filter_reasons'][reason] = self.stats['filter_reasons'].get(reason, 0) + 1
            return False, {'reason': reason, 'quality_score': 0}
        
        # 2. 垃圾检测
        is_spam, spam_reason = self.is_spam_post(feed_data)
        if is_spam:
            self.stats['filtered'] += 1
            self.stats['filter_reasons'][spam_reason] = self.stats['filter_reasons'].get(spam_reason, 0) + 1
            return False, {'reason': spam_reason, 'quality_score': 0, 'is_spam': True}
        
        # 3. 质量评分
        quality_score = self.calculate_quality_score(feed_data)
        if quality_score < self.min_quality_score:
            reason = f"质量评分过低: {quality_score:.1f} < {self.min_quality_score}"
            self.stats['filtered'] += 1
            self.stats['filter_reasons'][reason] = self.stats['filter_reasons'].get(reason, 0) + 1
            return False, {'reason': reason, 'quality_score': quality_score}
        
        # 通过所有检查
        self.stats['passed'] += 1
        
        quality_info = {
            'quality_score': quality_score,
            'is_spam': False,
            'checks': {
                'hard_filters': True,
                'spam_check': True,
                'quality_threshold': True
            }
        }
        
        return True, quality_info
    
    def process_directory(self, input_dir: str, output_dir: str):
        """处理整个目录"""
        input_path = Path(input_dir)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        print(f"扫描目录: {input_path}")
        feed_files = list(input_path.glob('feed_*_detail.json'))
        print(f"找到 {len(feed_files)} 个feed文件\n")
        
        passed_feeds = []
        
        for feed_file in feed_files:
            try:
                with open(feed_file, 'r', encoding='utf-8') as f:
                    feed_data = json.load(f)
                
                # 添加文件名信息
                feed_data['_source_file'] = feed_file.name
                
                # 过滤
                should_keep, quality_info = self.filter_feed(feed_data)
                
                if should_keep:
                    # 添加质量信息
                    feed_data['_quality_info'] = quality_info
                    passed_feeds.append((feed_file.name, feed_data))
                    
                    # 保存到输出目录
                    output_file = output_path / feed_file.name
                    with open(output_file, 'w', encoding='utf-8') as f:
                        json.dump(feed_data, f, ensure_ascii=False, indent=2)
                else:
                    print(f"  过滤: {feed_file.name} - {quality_info['reason']}")
                    
            except Exception as e:
                print(f"  错误: {feed_file.name} - {e}")
                continue
        
        # 保存过滤报告
        report = {
            'filter_config': {
                'min_comments': self.min_comments,
                'min_desc_length': self.min_desc_length,
                'min_quality_score': self.min_quality_score,
                'max_age_days': self.max_age_days
            },
            'statistics': self.stats,
            'passed_feeds': [f[0] for f in passed_feeds]
        }
        
        report_file = output_path / '_filter_report.json'
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        # 打印报告
        print("\n" + "="*50)
        print("过滤报告")
        print("="*50)
        print(f"总feed数: {self.stats['total']}")
        print(f"通过: {self.stats['passed']} ({self.stats['passed']/self.stats['total']*100:.1f}%)")
        print(f"过滤: {self.stats['filtered']} ({self.stats['filtered']/self.stats['total']*100:.1f}%)")
        print("\n过滤原因:")
        for reason, count in sorted(self.stats['filter_reasons'].items(), key=lambda x: -x[1]):
            print(f"  - {reason}: {count}")
        print(f"\n结果已保存到: {output_path}")
        print(f"报告文件: {report_file}")


def main():
    if len(sys.argv) < 3:
        print("小红书帖子质量过滤器")
        print()
        print("用法:")
        print(f"  python {sys.argv[0]} <input_dir> <output_dir> [options]")
        print()
        print("选项:")
        print("  --min-comments N     最小评论数 (默认: 5)")
        print("  --min-desc-len N     最小描述长度 (默认: 50)")
        print("  --min-score N        最小质量评分 (默认: 40)")
        print("  --max-age N          最大内容年龄/天 (默认: 730)")
        print()
        print("示例:")
        print(f"  python {sys.argv[0]} raw filtered")
        print(f"  python {sys.argv[0]} raw filtered --min-comments 10 --min-score 50")
        sys.exit(1)
    
    input_dir = sys.argv[1]
    output_dir = sys.argv[2]
    
    # 解析选项
    kwargs = {}
    i = 3
    while i < len(sys.argv):
        if sys.argv[i] == '--min-comments' and i + 1 < len(sys.argv):
            kwargs['min_comments'] = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--min-desc-len' and i + 1 < len(sys.argv):
            kwargs['min_desc_length'] = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--min-score' and i + 1 < len(sys.argv):
            kwargs['min_quality_score'] = float(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == '--max-age' and i + 1 < len(sys.argv):
            kwargs['max_age_days'] = int(sys.argv[i + 1])
            i += 2
        else:
            i += 1
    
    filter_tool = PostQualityFilter(**kwargs)
    filter_tool.process_directory(input_dir, output_dir)


if __name__ == '__main__':
    main()