#!/usr/bin/env python3
"""
餐厅数据去重与合并工具
用于处理从多个小红书帖子提取的餐厅数据

功能:
1. 从多个JSON文件提取餐厅信息
2. 基于名称+地址进行去重
3. Fuzzy matching处理相似名称
4. 合并同一餐厅的metrics数据
5. 输出标准化的餐厅数据库
"""

import json
import re
import os
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional
from difflib import SequenceMatcher
from collections import defaultdict

class RestaurantDeduper:
    """餐厅去重器"""
    
    # 常见别名映射
    ALIAS_MAP = {
        "王家卫": ["王家味"],
        "香锅大王": ["sizzling pot king", "hunan house", "一屋饭湘"],
        "留湘": ["ping's bistro"],
        "顾湘": ["hometown kitchen"],
        "杨裕兴": ["yum noodles"],
        "塔里木": ["tarim garden"],
        "阿拉上海": ["i shanghai delight"],
    }
    
    # 通用后缀，用于标准化名称
    SUFFIXES_TO_REMOVE = ['餐厅', '饭店', '馆', '店', '屋', '家', '吧', '厅', '楼']
    
    def __init__(self):
        self.restaurants: Dict[str, Dict] = {}  # key: canonical_id
        self.name_to_id: Dict[str, str] = {}    # normalized_name -> id
        self.address_to_id: Dict[str, str] = {} # normalized_address -> id
        
    def normalize_name(self, name: str) -> str:
        """标准化餐厅名称"""
        if not name:
            return ""
        
        # 转小写
        name = name.lower()
        
        # 移除非字母数字字符（保留中英文）
        name = re.sub(r'[^\u4e00-\u9fa5a-z0-9]', '', name)
        
        # 移除通用后缀
        for suffix in self.SUFFIXES_TO_REMOVE:
            if name.endswith(suffix):
                name = name[:-len(suffix)]
        
        return name.strip()
    
    def normalize_address(self, address: str) -> str:
        """标准化地址"""
        if not address:
            return ""
        
        # 转小写
        address = address.lower()
        
        # 提取关键部分 (街道号 + 城市)
        # 匹配模式: 数字+街道名, 城市, CA 邮编
        match = re.search(r'(\d+)\s+([^,]+),?\s*([^,]*),?\s*ca', address)
        if match:
            street_num, street_name, city = match.groups()
            return f"{street_num}_{street_name.strip().replace(' ', '_')}_{city.strip().replace(' ', '_')}"
        
        # 简化处理: 移除标点，保留字母数字
        address = re.sub(r'[^\u4e00-\u9fa5a-z0-9]', '', address)
        return address
    
    def calculate_similarity(self, s1: str, s2: str) -> float:
        """计算字符串相似度"""
        if not s1 or not s2:
            return 0.0
        return SequenceMatcher(None, s1, s2).ratio()
    
    def find_matching_restaurant(self, restaurant: Dict) -> Optional[str]:
        """
        查找匹配的现有餐厅
        返回: 匹配的restaurant_id 或 None
        """
        name = restaurant.get('name', '')
        address = restaurant.get('address', '')
        
        norm_name = self.normalize_name(name)
        norm_address = self.normalize_address(address)
        
        # 策略1: 精确名称匹配
        if norm_name in self.name_to_id:
            return self.name_to_id[norm_name]
        
        # 策略2: 别名匹配
        for canonical_name, aliases in self.ALIAS_MAP.items():
            all_names = [canonical_name.lower()] + [a.lower() for a in aliases]
            if norm_name in all_names:
                canonical_norm = self.normalize_name(canonical_name)
                if canonical_norm in self.name_to_id:
                    return self.name_to_id[canonical_norm]
        
        # 策略3: 地址精确匹配
        if norm_address and norm_address in self.address_to_id:
            return self.address_to_id[norm_address]
        
        # 策略4: Fuzzy匹配 (名称相似度 > 0.8)
        for existing_id, existing in self.restaurants.items():
            existing_norm_name = self.normalize_name(existing.get('name', ''))
            name_sim = self.calculate_similarity(norm_name, existing_norm_name)
            
            if name_sim > 0.8:
                # 名称非常相似，检查地址
                existing_norm_addr = self.normalize_address(existing.get('address', ''))
                addr_sim = self.calculate_similarity(norm_address, existing_norm_addr)
                
                # 地址相似度 > 0.5 或都为空，认为是同一家
                if addr_sim > 0.5 or (not norm_address and not existing_norm_addr):
                    return existing_id
        
        return None
    
    def merge_restaurants(self, existing: Dict, new: Dict) -> Dict:
        """合并两个餐厅的数据"""
        merged = existing.copy()
        
        # 合并metrics
        if 'metrics' in new:
            if 'metrics' not in merged:
                merged['metrics'] = new['metrics']
            else:
                # 合并discussion_volume
                if 'discussion_volume' in new['metrics']:
                    dv_existing = merged['metrics'].get('discussion_volume', {})
                    dv_new = new['metrics']['discussion_volume']
                    
                    merged['metrics']['discussion_volume'] = {
                        'total_posts': dv_existing.get('total_posts', 0) + dv_new.get('total_posts', 0),
                        'total_comments': dv_existing.get('total_comments', 0) + dv_new.get('total_comments', 0),
                        'total_engagement': dv_existing.get('total_engagement', 0) + dv_new.get('total_engagement', 0),
                        'mention_count': dv_existing.get('mention_count', 0) + dv_new.get('mention_count', 0),
                        'last_mentioned': max(dv_existing.get('last_mentioned', ''), dv_new.get('last_mentioned', '')),
                    }
                
                # 合并sentiment (加权平均)
                if 'sentiment_analysis' in new['metrics']:
                    sa_existing = merged['metrics'].get('sentiment_analysis', {})
                    sa_new = new['metrics']['sentiment_analysis']
                    
                    pos_e = sa_existing.get('positive_mentions', 0)
                    neg_e = sa_existing.get('negative_mentions', 0)
                    neu_e = sa_existing.get('neutral_mentions', 0)
                    
                    pos_n = sa_new.get('positive_mentions', 0)
                    neg_n = sa_new.get('negative_mentions', 0)
                    neu_n = sa_new.get('neutral_mentions', 0)
                    
                    total = pos_e + neg_e + neu_e + pos_n + neg_n + neu_n
                    
                    if total > 0:
                        score = (pos_e + pos_n + (neu_e + neu_n) * 0.5) / total
                        
                        merged['metrics']['sentiment_analysis'] = {
                            'overall': 'positive' if score >= 0.7 else 'mixed' if score >= 0.5 else 'negative',
                            'score': round(score, 2),
                            'positive_mentions': pos_e + pos_n,
                            'neutral_mentions': neu_e + neu_n,
                            'negative_mentions': neg_e + neg_n,
                            'key_positive_quotes': sa_existing.get('key_positive_quotes', []) + sa_new.get('key_positive_quotes', []),
                            'key_negative_quotes': sa_existing.get('key_negative_quotes', []) + sa_new.get('key_negative_quotes', []),
                        }
        
        # 合并sources
        if 'sources' in new:
            existing_sources = set(merged.get('sources', []))
            existing_sources.update(new['sources'])
            merged['sources'] = list(existing_sources)
        
        # 合并highlights
        if 'highlights' in new:
            existing_highlights = set(merged.get('highlights', []))
            existing_highlights.update(new['highlights'])
            merged['highlights'] = list(existing_highlights)
        
        # 合并recommendations
        if 'recommendations' in new:
            existing_rec = set(merged.get('recommendations', []))
            existing_rec.update(new['recommendations'])
            merged['recommendations'] = list(existing_rec)
        
        return merged
    
    def add_restaurant(self, restaurant: Dict) -> str:
        """
        添加餐厅到数据库
        返回: restaurant_id
        """
        # 查找是否已存在
        existing_id = self.find_matching_restaurant(restaurant)
        
        if existing_id:
            # 合并数据
            self.restaurants[existing_id] = self.merge_restaurants(
                self.restaurants[existing_id],
                restaurant
            )
            return existing_id
        else:
            # 创建新条目
            restaurant_id = f"r{len(self.restaurants) + 1:03d}"
            self.restaurants[restaurant_id] = restaurant
            
            # 更新索引
            norm_name = self.normalize_name(restaurant.get('name', ''))
            if norm_name:
                self.name_to_id[norm_name] = restaurant_id
            
            norm_address = self.normalize_address(restaurant.get('address', ''))
            if norm_address:
                self.address_to_id[norm_address] = restaurant_id
            
            return restaurant_id
    
    def extract_from_feed(self, feed_data: Dict) -> List[Dict]:
        """
        从单个feed数据中提取餐厅信息
        返回: 餐厅列表
        """
        restaurants = []
        feed_id = feed_data.get('id', '')
        
        # 从标题和描述中提取餐厅提及
        title = feed_data.get('title', '')
        desc = feed_data.get('desc', '')
        content = title + ' ' + desc
        
        # 从评论中提取
        comments = feed_data.get('comments', [])
        
        # 这里需要实现具体的餐厅提取逻辑
        # 简化版：假设我们已经有了提取好的餐厅数据
        if 'extracted_restaurants' in feed_data:
            for r in feed_data['extracted_restaurants']:
                r['sources'] = [feed_id]
                restaurants.append(r)
        
        return restaurants
    
    def process_feeds_directory(self, directory: str) -> Dict:
        """
        处理整个feed目录
        返回: 最终的餐厅数据库
        """
        raw_dir = Path(directory)
        
        print(f"扫描目录: {raw_dir}")
        
        feed_files = list(raw_dir.glob('feed_*_detail.json'))
        print(f"找到 {len(feed_files)} 个feed文件")
        
        for feed_file in feed_files:
            print(f"处理: {feed_file.name}")
            
            try:
                with open(feed_file, 'r', encoding='utf-8') as f:
                    feed_data = json.load(f)
                
                # 提取餐厅
                restaurants = self.extract_from_feed(feed_data)
                
                for r in restaurants:
                    self.add_restaurant(r)
                    
            except Exception as e:
                print(f"  错误: {e}")
                continue
        
        print(f"\n处理完成:")
        print(f"  总餐厅数: {len(self.restaurants)}")
        print(f"  去重合并次数: {len(feed_files) - len(self.restaurants)}")
        
        return {
            'version': '3.0-deduplicated',
            'total_restaurants': len(self.restaurants),
            'restaurants': list(self.restaurants.values())
        }
    
    def export_to_json(self, output_path: str):
        """导出到JSON文件"""
        data = {
            'version': '3.0-deduplicated',
            'total_restaurants': len(self.restaurants),
            'restaurants': list(self.restaurants.values())
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"已导出到: {output_path}")


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python dedupe_restaurants.py <raw_directory> [output.json]")
        sys.exit(1)
    
    raw_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'restaurants_deduped.json'
    
    deduper = RestaurantDeduper()
    
    # 处理feed目录
    result = deduper.process_feeds_directory(raw_dir)
    
    # 导出结果
    deduper.export_to_json(output_file)
    
    print("\n去重统计:")
    print(f"  最终餐厅数: {result['total_restaurants']}")


if __name__ == '__main__':
    main()