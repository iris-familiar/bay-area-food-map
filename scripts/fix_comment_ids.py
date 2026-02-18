#!/usr/bin/env python3
"""
修复已采集的评论数据 - 添加正确的comment_id
"""
import json
from pathlib import Path
from datetime import datetime, timezone

V2_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2")
COMMENTS_DIR = V2_DIR / "comments"

def fix_comment_data():
    fixed_count = 0
    
    for comments_file in COMMENTS_DIR.glob("*.json"):
        with open(comments_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        comments = data.get("comments", [])
        modified = False
        
        for c in comments:
            # 修复主评论ID
            if not c.get("comment_id"):
                # 尝试从其他字段获取ID
                # 由于原始数据没有保存ID，我们无法修复
                # 需要重新采集
                print(f"⚠️  {comments_file.name}: 主评论缺少comment_id，需要重新采集")
                break
            
            # 确保有root_comment_id
            if not c.get("root_comment_id"):
                c["root_comment_id"] = c["comment_id"]
                modified = True
            
            # 修复子评论
            for sub in c.get("sub_comments", []):
                if not sub.get("root_comment_id"):
                    sub["root_comment_id"] = c["comment_id"]
                    modified = True
        
        if modified:
            with open(comments_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            fixed_count += 1
    
    print(f"\n修复完成: {fixed_count} 个文件")

if __name__ == "__main__":
    fix_comment_data()
