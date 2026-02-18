#!/usr/bin/env python3
"""
重新采集评论数据 - 修复comment_id问题
只重新采集有问题的评论，保留正确的帖子数据
"""
import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone

PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
RAW_DIR = PROJECT_DIR / "data/raw"
V2_DIR = RAW_DIR / "v2"
POSTS_DIR = V2_DIR / "posts"
COMMENTS_DIR = V2_DIR / "comments"

MCP_SCRIPT = "/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh"

def load_search_results():
    """加载搜索结果的帖子列表"""
    with open(RAW_DIR / "phase1a_search_results.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return {p["id"]: p for p in data["posts"]}

def mcp_call(tool_name, args, timeout=45):
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
        return None
    except Exception as e:
        print(f"      MCP错误: {e}")
        return None

def parse_comments(raw_data, note_id):
    """从MCP响应中解析评论数据"""
    if not raw_data or "result" not in raw_data:
        return []
    
    result = raw_data["result"]
    if "content" not in result or not result["content"]:
        return []
    
    content_list = result["content"]
    if not content_list or "text" not in content_list[0]:
        return []
    
    try:
        nested_data = json.loads(content_list[0]["text"])
    except:
        return []
    
    if "data" not in nested_data or "comments" not in nested_data["data"]:
        return []
    
    comments_data = nested_data["data"]["comments"]
    comments = []
    
    for c in comments_data.get("list", []):
        # 使用正确的字段名 'id' 而不是 'commentId'
        main_comment_id = c.get("id", "")
        
        if not main_comment_id:
            continue  # 跳过没有ID的评论
        
        comment = {
            "comment_id": main_comment_id,
            "note_id": note_id,
            "parent_id": c.get("parentCommentId", ""),
            "root_comment_id": main_comment_id,  # 主评论自己是根
            "content": c.get("content", ""),
            "create_time": c.get("createTime", ""),
            "author": {
                "user_id": c.get("userInfo", {}).get("userId", ""),
                "nickname": c.get("userInfo", {}).get("nickname", ""),
                "avatar": c.get("userInfo", {}).get("avatar", "")
            },
            "interaction": {
                "liked_count": int(c.get("likeCount") or 0),
                "reply_count": int(c.get("subCommentCount") or 0)
            },
            "sub_comments": []
        }
        
        # 处理子评论
        for sub in c.get("subComments", []):
            sub_comment = {
                "comment_id": sub.get("id", ""),
                "parent_id": main_comment_id,
                "root_comment_id": main_comment_id,
                "content": sub.get("content", ""),
                "create_time": sub.get("createTime", ""),
                "author": {
                    "user_id": sub.get("userInfo", {}).get("userId", ""),
                    "nickname": sub.get("userInfo", {}).get("nickname", ""),
                    "avatar": sub.get("userInfo", {}).get("avatar", "")
                },
                "interaction": {
                    "liked_count": int(sub.get("likeCount") or 0)
                }
            }
            comment["sub_comments"].append(sub_comment)
        
        comments.append(comment)
    
    return comments

def needs_recollection(comments_file):
    """检查评论文件是否需要重新采集"""
    if not comments_file.exists():
        return True
    
    with open(comments_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    comments = data.get("comments", [])
    
    # 检查是否有主评论缺少comment_id
    for c in comments:
        if not c.get("comment_id"):
            return True
        # 检查作者信息是否完整
        if not c.get("author", {}).get("user_id"):
            return True
    
    return False

def main():
    print("=" * 60)
    print("修复评论数据 - 重新采集有问题的评论")
    print("=" * 60)
    
    # 加载帖子映射
    posts_map = load_search_results()
    
    # 找出需要重新采集的帖子
    needs_fix = []
    for note_id in posts_map.keys():
        comments_file = COMMENTS_DIR / f"{note_id}.json"
        if needs_recollection(comments_file):
            needs_fix.append(note_id)
    
    total = len(needs_fix)
    print(f"\n需要重新采集: {total} 个帖子")
    
    if total == 0:
        print("✅ 所有评论数据完整，无需修复")
        return
    
    success_count = 0
    fail_count = 0
    
    for idx, note_id in enumerate(needs_fix, 1):
        post_info = posts_map[note_id]
        xsec_token = post_info["xsecToken"]
        title = post_info.get("title", "")[:30]
        
        print(f"\n[{idx}/{total}] 重新采集: {title}")
        print(f"       ID: {note_id}")
        
        # 调用MCP获取评论
        args = {
            "feed_id": note_id,
            "xsec_token": xsec_token,
            "load_all_comments": False,
            "limit": 30
        }
        
        raw_data = mcp_call("get_feed_detail", args)
        
        if not raw_data:
            print(f"       ❌ MCP调用失败")
            fail_count += 1
            continue
        
        # 解析评论
        comments = parse_comments(raw_data, note_id)
        
        if not comments:
            print(f"       ⚠️  无评论数据或解析失败")
            # 仍然保存空评论文件（避免重复尝试）
            comments = []
        
        # 保存评论
        comments_file = COMMENTS_DIR / f"{note_id}.json"
        with open(comments_file, "w", encoding="utf-8") as f:
            json.dump({
                "note_id": note_id,
                "comments": comments,
                "total_count": len(comments),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "fixed": True  # 标记为已修复
            }, f, ensure_ascii=False, indent=2)
        
        print(f"       ✅ 成功 | 评论: {len(comments)}")
        success_count += 1
    
    print("\n" + "=" * 60)
    print("修复完成!")
    print("=" * 60)
    print(f"总计: {total}")
    print(f"成功: {success_count}")
    print(f"失败: {fail_count}")

if __name__ == "__main__":
    main()
