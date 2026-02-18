#!/usr/bin/env python3
"""
验证评论数据完整性
检查所有评论是否有正确的comment_id
"""
import json
from pathlib import Path
from datetime import datetime, timezone

V2_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2")
COMMENTS_DIR = V2_DIR / "comments"

def validate_comments():
    """验证所有评论文件的完整性"""
    stats = {
        "total_files": 0,
        "valid_files": 0,
        "invalid_files": 0,
        "total_comments": 0,
        "comments_with_id": 0,
        "comments_without_id": 0,
        "total_replies": 0,
        "replies_with_id": 0,
        "invalid_files_list": []
    }
    
    for comments_file in COMMENTS_DIR.glob("*.json"):
        stats["total_files"] += 1
        
        with open(comments_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        comments = data.get("comments", [])
        file_valid = True
        
        for c in comments:
            stats["total_comments"] += 1
            
            # 检查主评论ID
            if c.get("comment_id"):
                stats["comments_with_id"] += 1
            else:
                stats["comments_without_id"] += 1
                file_valid = False
            
            # 检查子评论ID
            for sub in c.get("sub_comments", []):
                stats["total_replies"] += 1
                if sub.get("comment_id"):
                    stats["replies_with_id"] += 1
        
        if file_valid:
            stats["valid_files"] += 1
        else:
            stats["invalid_files"] += 1
            stats["invalid_files_list"].append(comments_file.name)
    
    # 打印报告
    print("=" * 60)
    print("评论数据完整性验证报告")
    print("=" * 60)
    print(f"\n文件统计:")
    print(f"  总文件数: {stats['total_files']}")
    print(f"  有效文件: {stats['valid_files']}")
    print(f"  无效文件: {stats['invalid_files']}")
    
    print(f"\n评论统计:")
    print(f"  总评论数: {stats['total_comments']}")
    print(f"  有ID的评论: {stats['comments_with_id']}")
    print(f"  无ID的评论: {stats['comments_without_id']}")
    
    print(f"\n回复统计:")
    print(f"  总回复数: {stats['total_replies']}")
    print(f"  有ID的回复: {stats['replies_with_id']}")
    
    if stats['invalid_files_list']:
        print(f"\n需要修复的文件:")
        for fname in stats['invalid_files_list'][:10]:  # 只显示前10个
            print(f"  - {fname}")
        if len(stats['invalid_files_list']) > 10:
            print(f"  ... 还有 {len(stats['invalid_files_list']) - 10} 个")
    
    # 计算完整性百分比
    if stats['total_comments'] > 0:
        integrity = stats['comments_with_id'] * 100 / stats['total_comments']
        print(f"\n数据完整性: {integrity:.1f}%")
    
    # 保存报告
    stats['generated_at'] = datetime.now(timezone.utc).isoformat()
    with open(V2_DIR / "validation_report.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    return stats

if __name__ == "__main__":
    validate_comments()
