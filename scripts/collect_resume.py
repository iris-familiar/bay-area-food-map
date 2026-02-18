#!/usr/bin/env python3
"""
小红书数据采集Pipeline - 断点续传版本
支持超时处理和断点续传
"""

import json
import os
import sys
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
RAW_DIR = PROJECT_DIR / "data/raw"
V2_DIR = RAW_DIR / "v2"
POSTS_DIR = V2_DIR / "posts"
COMMENTS_DIR = V2_DIR / "comments"
AUTHORS_DIR = V2_DIR / "authors"

MCP_SCRIPT = "/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh"

def load_search_results():
    with open(RAW_DIR / "phase1a_search_results.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["posts"]

def mcp_call(tool_name, args, timeout=30):
    """调用MCP工具，带超时"""
    try:
        result = subprocess.run(
            [MCP_SCRIPT, tool_name, json.dumps(args)],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        return None
    except subprocess.TimeoutExpired:
        print(f"      ⚠️ 超时 ({timeout}s)")
        return None
    except Exception as e:
        print(f"      ⚠️ 错误: {e}")
        return None

def parse_mcp_result(raw_data):
    if not raw_data or "result" not in raw_data:
        return None, None
    
    result = raw_data["result"]
    if "content" not in result or not result["content"]:
        return None, None
    
    content_list = result["content"]
    if not content_list:
        return None, None
    
    first_item = content_list[0]
    if "text" not in first_item:
        return None, None
    
    try:
        nested_data = json.loads(first_item["text"])
    except:
        return None, None
    
    if "data" not in nested_data:
        return None, None
    
    data = nested_data["data"]
    return data.get("note", {}), data.get("comments", {})

def process_post_data(note_data, comments_data, note_id, xsec_token):
    if not note_data:
        return None, None
    
    post = {
        "note_id": note_id,
        "xsec_token": xsec_token,
        "metadata": {
            "title": note_data.get("title", ""),
            "content": note_data.get("desc", ""),
            "create_time": note_data.get("createTime", ""),
            "update_time": note_data.get("updateTime", ""),
            "ip_location": note_data.get("ipLocation", "")
        },
        "author": {
            "user_id": note_data.get("user", {}).get("userId", ""),
            "nickname": note_data.get("user", {}).get("nickname", ""),
            "avatar": note_data.get("user", {}).get("avatar", "")
        },
        "interaction": {
            "liked_count": note_data.get("interactInfo", {}).get("likedCount", 0),
            "collected_count": note_data.get("interactInfo", {}).get("collectedCount", 0),
            "comment_count": note_data.get("interactInfo", {}).get("commentCount", 0),
            "share_count": note_data.get("interactInfo", {}).get("shareCount", 0)
        },
        "tags": [tag.get("name", "") for tag in note_data.get("tagList", [])],
        "images": note_data.get("imageList", []),
        "fetched_at": datetime.now(timezone.utc).isoformat()
    }
    
    comments = []
    for c in comments_data.get("list", []):
        comment = {
            "comment_id": c.get("commentId", ""),
            "note_id": note_id,
            "parent_id": c.get("parentCommentId", ""),
            "content": c.get("content", ""),
            "create_time": c.get("createTime", ""),
            "author": {
                "user_id": c.get("user", {}).get("userId", ""),
                "nickname": c.get("user", {}).get("nickname", ""),
                "avatar": c.get("user", {}).get("avatar", "")
            },
            "liked_count": c.get("likedCount", 0),
            "sub_comments": c.get("subComments", [])
        }
        comments.append(comment)
    
    return post, comments

def collect_post(post_info, retry=0):
    """采集单个帖子，带重试"""
    note_id = post_info["id"]
    xsec_token = post_info["xsecToken"]
    
    # 检查是否已存在
    post_file = POSTS_DIR / f"{note_id}.json"
    if post_file.exists():
        return {"status": "exists", "note_id": note_id}
    
    # 获取数据（不加载全部评论以加快速度）
    args = {
        "feed_id": note_id,
        "xsec_token": xsec_token,
        "load_all_comments": False,  # 不加载全部评论
        "limit": 20
    }
    
    raw_data = mcp_call("get_feed_detail", args, timeout=45)
    
    if not raw_data:
        if retry < 2:
            print(f"      🔄 重试 {retry + 1}/2...")
            time.sleep(2)
            return collect_post(post_info, retry + 1)
        return {"status": "failed", "note_id": note_id, "error": "MCP timeout"}
    
    note_data, comments_data = parse_mcp_result(raw_data)
    
    if not note_data:
        return {"status": "failed", "note_id": note_id, "error": "Parse failed"}
    
    post, comments = process_post_data(note_data, comments_data, note_id, xsec_token)
    
    if not post:
        return {"status": "failed", "note_id": note_id, "error": "Process failed"}
    
    # 保存
    with open(post_file, "w", encoding="utf-8") as f:
        json.dump(post, f, ensure_ascii=False, indent=2)
    
    comments_file = COMMENTS_DIR / f"{note_id}.json"
    with open(comments_file, "w", encoding="utf-8") as f:
        json.dump({
            "note_id": note_id,
            "comments": comments,
            "total_count": len(comments),
            "fetched_at": datetime.now(timezone.utc).isoformat()
        }, f, ensure_ascii=False, indent=2)
    
    return {
        "status": "success",
        "note_id": note_id,
        "has_content": bool(post["metadata"]["content"]),
        "comment_count": len(comments)
    }

def main():
    print("=" * 60)
    print("小红书数据采集 Pipeline - 断点续传版")
    print("=" * 60)
    
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    COMMENTS_DIR.mkdir(parents=True, exist_ok=True)
    AUTHORS_DIR.mkdir(parents=True, exist_ok=True)
    
    posts_list = load_search_results()
    total = len(posts_list)
    print(f"\n总计 {total} 条帖子需要采集")
    
    # 统计
    stats = {"total": total, "success": 0, "exists": 0, "failed": 0, "failed_ids": []}
    
    for idx, post_info in enumerate(posts_list, 1):
        note_id = post_info["id"]
        title = post_info.get("title", "")[:25]
        
        print(f"\n[{idx:2d}/{total}] {title}...")
        print(f"       ID: {note_id}")
        
        result = collect_post(post_info)
        
        if result["status"] == "success":
            stats["success"] += 1
            print(f"       ✅ 成功 | 正文: {len(title)} | 评论: {result['comment_count']}")
        elif result["status"] == "exists":
            stats["exists"] += 1
            print(f"       ✓ 已存在")
        else:
            stats["failed"] += 1
            stats["failed_ids"].append(note_id)
            print(f"       ❌ 失败: {result.get('error', 'unknown')}")
        
        # 进度
        completed = stats["success"] + stats["exists"]
        print(f"       进度: {completed}/{total} ({completed*100//total}%)")
        
        time.sleep(0.5)
    
    # 报告
    print("\n" + "=" * 60)
    print("采集完成!")
    print("=" * 60)
    print(f"总计: {stats['total']}")
    print(f"成功: {stats['success']}")
    print(f"已存在: {stats['exists']}")
    print(f"失败: {stats['failed']}")
    
    if stats["failed_ids"]:
        print(f"\n失败的ID: {stats['failed_ids']}")
    
    stats["completed_at"] = datetime.now(timezone.utc).isoformat()
    with open(V2_DIR / "collection_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    return stats

if __name__ == "__main__":
    main()
