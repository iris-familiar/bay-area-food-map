#!/usr/bin/env python3
"""
小红书数据采集Pipeline - 并行版本
使用多进程加速采集
"""

import json
import os
import sys
import time
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from multiprocessing import Pool, Manager
from functools import partial

# 配置
PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
RAW_DIR = PROJECT_DIR / "data/raw"
V2_DIR = RAW_DIR / "v2"
POSTS_DIR = V2_DIR / "posts"
COMMENTS_DIR = V2_DIR / "comments"
AUTHORS_DIR = V2_DIR / "authors"

MCP_SCRIPT = "/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh"

def load_search_results():
    """加载搜索结果的帖子列表"""
    with open(RAW_DIR / "phase1a_search_results.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["posts"]

def mcp_call(tool_name, args, timeout=60):
    """调用MCP工具"""
    try:
        result = subprocess.run(
            [MCP_SCRIPT, tool_name, json.dumps(args)],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            return None
    except Exception as e:
        return None

def parse_mcp_result(raw_data):
    """解析MCP返回的数据结构"""
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
    """处理原始数据为规范格式"""
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

def collect_single_post(post_info):
    """采集单个帖子（用于多进程）"""
    note_id = post_info["id"]
    xsec_token = post_info["xsecToken"]
    title = post_info.get("title", "")[:30]
    
    # 检查是否已存在
    post_file = POSTS_DIR / f"{note_id}.json"
    if post_file.exists():
        return {"status": "exists", "note_id": note_id}
    
    # 获取数据
    args = {
        "feed_id": note_id,
        "xsec_token": xsec_token,
        "load_all_comments": True,
        "click_more_replies": False,
        "limit": 30
    }
    
    raw_data = mcp_call("get_feed_detail", args, timeout=90)
    
    if not raw_data:
        return {"status": "failed", "note_id": note_id, "error": "MCP call failed"}
    
    # 解析数据
    note_data, comments_data = parse_mcp_result(raw_data)
    
    if not note_data:
        return {"status": "failed", "note_id": note_id, "error": "Parse failed"}
    
    # 处理数据
    post, comments = process_post_data(note_data, comments_data, note_id, xsec_token)
    
    if not post:
        return {"status": "failed", "note_id": note_id, "error": "Process failed"}
    
    # 保存帖子
    with open(post_file, "w", encoding="utf-8") as f:
        json.dump(post, f, ensure_ascii=False, indent=2)
    
    # 保存评论
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
    print("小红书数据采集 Pipeline - 并行版本")
    print("=" * 60)
    
    # 创建目录
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    COMMENTS_DIR.mkdir(parents=True, exist_ok=True)
    AUTHORS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 加载帖子列表
    posts_list = load_search_results()
    total = len(posts_list)
    print(f"\n总计 {total} 条帖子需要采集")
    print(f"使用单进程顺序采集（避免并发限制）\n")
    
    # 顺序采集（避免并发限制）
    results = []
    for idx, post_info in enumerate(posts_list, 1):
        print(f"[{idx:3d}/{total}] ", end="", flush=True)
        result = collect_single_post(post_info)
        results.append(result)
        
        if result["status"] == "success":
            print(f"✅ {result['note_id'][:16]}... | 评论: {result['comment_count']:3d}")
        elif result["status"] == "exists":
            print(f"✓ 已存在")
        else:
            print(f"❌ 失败: {result.get('error', 'unknown')}")
        
        # 间隔防止限流
        time.sleep(0.3)
    
    # 统计
    success = sum(1 for r in results if r["status"] == "success")
    exists = sum(1 for r in results if r["status"] == "exists")
    failed = sum(1 for r in results if r["status"] == "failed")
    total_comments = sum(r.get("comment_count", 0) for r in results if r["status"] == "success")
    
    print("\n" + "=" * 60)
    print("采集完成!")
    print("=" * 60)
    print(f"总计帖子: {total}")
    print(f"成功采集: {success}")
    print(f"已存在: {exists}")
    print(f"失败: {failed}")
    print(f"总评论数: {total_comments}")
    
    # 保存统计
    stats = {
        "total": total,
        "success": success,
        "exists": exists,
        "failed": failed,
        "total_comments": total_comments,
        "failed_ids": [r["note_id"] for r in results if r["status"] == "failed"],
        "completed_at": datetime.now(timezone.utc).isoformat()
    }
    
    with open(V2_DIR / "collection_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    # 生成数据完整性报告
    generate_integrity_report()
    
    return stats

def generate_integrity_report():
    """生成数据完整性报告"""
    print("\n" + "=" * 60)
    print("数据完整性检查")
    print("=" * 60)
    
    posts_files = list(POSTS_DIR.glob("*.json"))
    comments_files = list(COMMENTS_DIR.glob("*.json"))
    
    posts_with_content = 0
    posts_with_comments = 0
    total_comments = 0
    
    for post_file in posts_files:
        with open(post_file, "r", encoding="utf-8") as f:
            post = json.load(f)
        
        if post.get("metadata", {}).get("content"):
            posts_with_content += 1
        
        # 检查对应评论文件
        note_id = post["note_id"]
        comments_file = COMMENTS_DIR / f"{note_id}.json"
        if comments_file.exists():
            with open(comments_file, "r", encoding="utf-8") as f:
                cdata = json.load(f)
                ccount = len(cdata.get("comments", []))
                if ccount > 0:
                    posts_with_comments += 1
                    total_comments += ccount
    
    print(f"帖子文件数: {len(posts_files)}")
    print(f"评论文件数: {len(comments_files)}")
    print(f"有正文的帖子: {posts_with_content}")
    print(f"有评论的帖子: {posts_with_comments}")
    print(f"总评论数: {total_comments}")
    
    # 保存报告
    report = {
        "total_posts": len(posts_files),
        "total_comments_files": len(comments_files),
        "posts_with_content": posts_with_content,
        "posts_with_comments": posts_with_comments,
        "total_comments": total_comments,
        "checks": {
            "all_posts_have_content": posts_with_content == len(posts_files),
            "all_posts_have_comments_file": len(comments_files) == len(posts_files)
        },
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    
    with open(V2_DIR / "integrity_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\n报告已保存至: {V2_DIR / 'integrity_report.json'}")

if __name__ == "__main__":
    main()
