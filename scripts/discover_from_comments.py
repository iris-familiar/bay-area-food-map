#!/usr/bin/env python3
"""
评论区餐厅发现器 - 修复版
"""

import json
import re
import os
from collections import Counter
from typing import List, Dict

# 停用词
STOP_WORDS = {
    "这里", "那边", "我家", "你家", "他家", "这家", "那家",
    "外卖", "店里", "门口", "附近", "旁边", "对面",
    "昨天", "今天", "明天", "上次", "这次", "下次",
    "老板", "服务员", "厨师", "客人", "朋友", "同事",
    "推荐", "试试", "感觉", "觉得", "还是", "不过",
    "应该", "可能", "其实", "真的", "确实", "比较",
}

# 已知餐厅
KNOWN_RESTAURANTS = {
    "香锅大王", "王家味", "Sizzling Pot King", "Wang Jia Wei",
    "留湘", "顾湘", "Ping's Bistro", "Hometown Kitchen",
    "Ping's Bistro", "Hometown Kitchen",
    "Tamarine", "Shoji", "Z&Y", "Z&Y", "Mikiya",
    "Noren Izakaya", "杨裕兴", "Yum Noodles",
    "阿拉上海", "Shanghai Flavor", "I Shanghai Delight",
    "Katsu Gin", "Wooga Gamjatang", "Wooga", "Ushiya",
    "Kunjip Tofu", "Kunjip", "Indo Restaurant", "Indo",
    "Das Bierhauz", "Bierhauz",
    "Cali Spartan", "Cali Spartan Mexican Kitchen",
    "Aceking", "Ace King", "Aceking麻辣烫",
    "塔里木", "Tarim Garden", "Tarim",
    "老赵川菜", "Chef Zhao", "冯校长", "香小馆",
    "Henry Hunan", "李一季", "yuan bistro", "Yuan Bistro",
}

def extract_mentions(text: str) -> List[str]:
    """简单提取：找2-8字的中文词组"""
    if not text:
        return []
    
    # 从评论中找可能的餐厅名
    # 模式1: 直接提到的店名 (通常前面有"去"、"吃"、"推荐")
    patterns = [
        r"去([\u4e00-\u9fa5]{2,6})(?:吃|尝尝|试试)",
        r"([\u4e00-\u9fa5]{2,6})(?:不错|好吃|推荐|还行)",
    ]
    
    found = []
    for p in patterns:
        matches = re.findall(p, text)
        found.extend(matches)
    
    # 过滤
    filtered = []
    for name in found:
        name = name.strip()
        if len(name) < 2:
            continue
        if name in STOP_WORDS:
            continue
        if name in KNOWN_RESTAURANTS:
            continue
        if any(k in name for k in ["疫情", "美国", "英国", "加拿大"]):
            continue
        filtered.append(name)
    
    return filtered

def parse_raw_file(filepath: str) -> List[str]:
    """解析raw文件，提取评论"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return []
    
    comments = []
    
    # 处理包装结构
    if 'result' in data and 'content' in data['result']:
        content_list = data['result']['content']
        for item in content_list:
            if 'text' in item:
                try:
                    inner_data = json.loads(item['text'])
                    
                    # 提取评论
                    if 'data' in inner_data and 'comments' in inner_data['data']:
                        comments_list = inner_data['data']['comments'].get('list', [])
                        for c in comments_list:
                            if 'content' in c:
                                comments.append(c['content'])
                            # 子评论
                            for sub in c.get('subComments', []):
                                if 'content' in sub:
                                    comments.append(sub['content'])
                    
                    # 标题和描述
                    if 'data' in inner_data and 'note' in inner_data['data']:
                        note = inner_data['data']['note']
                        if 'title' in note:
                            comments.append(note['title'])
                        if 'desc' in note:
                            comments.append(note['desc'])
                            
                except json.JSONDecodeError:
                    pass
    
    return comments

def main():
    raw_dir = "raw"
    
    print("🔍 评论区餐厅发现器")
    print("=" * 50)
    print()
    
    all_mentions = Counter()
    total_files = 0
    total_comments = 0
    
    for filename in os.listdir(raw_dir):
        if not filename.endswith('.json'):
            continue
        
        filepath = os.path.join(raw_dir, filename)
        comments = parse_raw_file(filepath)
        
        if comments:
            total_files += 1
            total_comments += len(comments)
            
            for comment in comments:
                mentions = extract_mentions(comment)
                all_mentions.update(mentions)
    
    print(f"📊 分析完成")
    print(f"   文件数: {total_files}")
    print(f"   评论数: {total_comments}")
    print()
    
    # 显示结果
    print("🍴 发现的新餐厅候选:")
    print("-" * 50)
    
    # 过滤：至少被提及2次
    candidates = [(name, count) for name, count in all_mentions.most_common() if count >= 2]
    
    if candidates:
        for name, count in candidates[:15]:
            print(f"   {name}: {count}次提及")
    else:
        print("   (从当前数据中发现较少，建议扩大搜索范围)")
    
    # 单次提及的也显示
    print("\n📝 单次提及（待验证）:")
    single_mentions = [(name, count) for name, count in all_mentions.most_common() if count == 1]
    for name, count in single_mentions[:10]:
        print(f"   {name}")
    
    print()
    print(f"📈 总计发现: {len(candidates)} 个高置信候选，{len(single_mentions)} 个低置信候选")
    
    # 保存
    output = {
        "discovered_at": "2026-02-15",
        "source": "评论区挖掘",
        "files_analyzed": total_files,
        "comments_analyzed": total_comments,
        "high_confidence": [
            {"name": name, "mentions": count, "status": "pending"}
            for name, count in candidates
        ],
        "low_confidence": [
            {"name": name, "mentions": count, "status": "verify"}
            for name, count in single_mentions[:20]
        ]
    }
    
    os.makedirs("data", exist_ok=True)
    with open("data/candidates_from_comments.json", 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已保存: data/candidates_from_comments.json")

if __name__ == "__main__":
    main()
