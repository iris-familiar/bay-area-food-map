#!/usr/bin/env python3
"""
小红书数据采集Pipeline - Phase 1 & 2
获取所有帖子详情和评论
"""

import json
import os
import sys
import time
import subprocess
from datetime import datetime
from pathlib import Path

# 配置
PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
RAW_DIR = PROJECT_DIR / "data/raw"
V2_DIR = RAW_DIR / "v2"
POSTS_DIR = V2_DIR / "posts"
COMMENTS_DIR = V2_DIR / "comments"
AUTHORS_DIR = V2_DIR / "authors"

MCP_URL = "http://localhost:18060/mcp"
MCP_SCRIPT = "/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh"

def load_search_results():
    """加载搜索结果的帖子列表"""
    with open(RAW_DIR / "phase1a_search_results.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["posts"]

def mcp_call(tool_name, args):
    """调用MCP工具"""
    try:
        result = subprocess.run(
            [MCP_SCRIPT, tool_name, json.dumps(args)],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"Error calling {tool_name}: {result.stderr}")
            return None
    except Exception as e:
        print(f"Exception calling {tool_name}: {e}")
        return None

def parse_mcp_result(raw_data):
    """解析MCP返回的数据结构"""
    if not raw_data:
        return None, None
    
    if "result" not in raw_data:
        print(f"No 'result' in response: {list(raw_data.keys())}")
        return None, None
    
    result = raw_data["result"]
    
    # content is a list with JSON text
    if "content" not in result or not result["content"]:
        print(f"No 'content' in result")
        return None, None
    
    content_list = result["content"]
    if not content_list:
        return None, None
    
    # Parse the first item's text as JSON
    first_item = content_list[0]
    if "text" not in first_item:
        return None, None
    
    try:
        nested_data = json.loads(first_item["text"])
    except json.JSONDecodeError as e:
        print(f"Failed to parse nested JSON: {e}")
        return None, None
    
    if "data" not in nested_data:
        return None, None
    
    data = nested_data["data"]
    note_data = data.get("note", {})
    comments_data = data.get("comments", {})
    
    return note_data, comments_data

def process_post_data(note_data, comments_data, note_id, xsec_token):
    """处理原始数据为规范格式"""
    if not note_data:
        return None, None
    
    # 提取帖子数据
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
        "fetched_at": datetime.utcnow().isoformat() + "Z"
    }
    
    # 提取评论数据
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

def save_author_info(author_data):
    """保存作者信息（避免重复）"""
    if not author_data or not author_data.get("user_id"):
        return
    
    author_file = AUTHORS_DIR / f"{author_data['user_id']}.json"
    if not author_file.exists():
        with open(author_file, "w", encoding="utf-8") as f:
            json.dump(author_data, f, ensure_ascii=False, indent=2)

def main():
    print("=" * 60)
    print("小红书数据采集 Pipeline")
    print("=" * 60)
    
    # 创建目录
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    COMMENTS_DIR.mkdir(parents=True, exist_ok=True)
    AUTHORS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 加载帖子列表
    posts_list = load_search_results()
    total = len(posts_list)
    print(f"\n总计 {total} 条帖子需要采集")
    
    # 统计
    stats = {
        "total": total,
        "success": 0,
        "failed": 0,
        "posts_with_content": 0,
        "posts_with_comments": 0,
        "total_comments": 0,
        "failed_ids": []
    }
    
    # 采集所有帖子
    for idx, post_info in enumerate(posts_list, 1):
        note_id = post_info["id"]
        xsec_token = post_info["xsecToken"]
        title = post_info.get("title", "")[:50]
        
        print(f"\n[{idx}/{total}] 采集: {title}...")
        print(f"      ID: {note_id}")
        
        # 检查是否已存在
        post_file = POSTS_DIR / f"{note_id}.json"
        if post_file.exists():
            print(f"      ✓ 已存在，跳过")
            # 读取已有数据统计
            with open(post_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            stats["success"] += 1
            if existing.get("metadata", {}).get("content"):
                stats["posts_with_content"] += 1
            # 检查评论文件
            comments_file = COMMENTS_DIR / f"{note_id}.json"
            if comments_file.exists():
                with open(comments_file, "r", encoding="utf-8") as f:
                    cdata = json.load(f)
                    ccount = len(cdata.get("comments", []))
                    if ccount > 0:
                        stats["posts_with_comments"] += 1
                        stats["total_comments"] += ccount
            continue
        
        # 获取数据
        args = {
            "feed_id": note_id,
            "xsec_token": xsec_token,
            "load_all_comments": True,
            "click_more_replies": False,  # 不展开子回复以加快速度
            "limit": 50  # 最多50条评论
        }
        raw_data = mcp_call("get_feed_detail", args)
        
        if not raw_data:
            print(f"      ❌ MCP调用失败")
            stats["failed"] += 1
            stats["failed_ids"].append(note_id)
            continue
        
        # 解析数据
        note_data, comments_data = parse_mcp_result(raw_data)
        
        if not note_data:
            print(f"      ❌ 数据解析失败")
            stats["failed"] += 1
            stats["failed_ids"].append(note_id)
            continue
        
        # 处理数据
        post, comments = process_post_data(note_data, comments_data, note_id, xsec_token)
        
        if not post:
            print(f"      ❌ 数据处理失败")
            stats["failed"] += 1
            stats["failed_ids"].append(note_id)
            continue
        
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
                "fetched_at": datetime.utcnow().isoformat() + "Z"
            }, f, ensure_ascii=False, indent=2)
        
        # 保存作者信息
        save_author_info(post["author"])
        for c in comments:
            save_author_info(c["author"])
        
        # 更新统计
        stats["success"] += 1
        if post["metadata"]["content"]:
            stats["posts_with_content"] += 1
        if comments:
            stats["posts_with_comments"] += 1
            stats["total_comments"] += len(comments)
        
        print(f"      ✅ 成功 | 正文: {len(post['metadata']['content'])} 字符 | 评论: {len(comments)}")
        
        # 避免请求过快
        time.sleep(0.5)
    
    # 生成报告
    print("\n" + "=" * 60)
    print("采集完成!")
    print("=" * 60)
    print(f"总计帖子: {stats['total']}")
    print(f"成功: {stats['success']}")
    print(f"失败: {stats['failed']}")
    print(f"有正文的帖子: {stats['posts_with_content']}")
    print(f"有评论的帖子: {stats['posts_with_comments']}")
    print(f"总评论数: {stats['total_comments']}")
    
    if stats["failed_ids"]:
        print(f"\n失败的ID:")
        for fid in stats["failed_ids"]:
            print(f"  - {fid}")
    
    # 保存统计
    stats["completed_at"] = datetime.utcnow().isoformat() + "Z"
    with open(V2_DIR / "collection_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    return stats

if __name__ == "__main__":
    main()
