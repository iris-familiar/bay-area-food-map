#!/usr/bin/env python3
"""
重新采集旧格式的帖子
"""

import json
import subprocess
import time
from pathlib import Path

PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
DATA_DIR = PROJECT_DIR / "data/raw/v2"
XHS_DIR = Path("/Users/joeli/.agents/skills/xiaohongshu/scripts")
POSTS_DIR = DATA_DIR / "posts"

def load_search_results():
    """加载搜索结果获取id到token的映射"""
    with open(PROJECT_DIR / "data/raw/phase1a_search_results.json", "r") as f:
        data = json.load(f)
    
    id_token_map = {}
    for post in data["posts"]:
        note_id = post["id"]
        token = post.get("xsecToken", "")
        if note_id and token and note_id not in id_token_map:
            id_token_map[note_id] = token
    return id_token_map

def find_old_format_files():
    """找出旧格式的文件"""
    old_files = []
    for post_file in POSTS_DIR.glob("*.json"):
        with open(post_file) as f:
            content = f.read().strip()
        data = json.loads(content)
        
        # Check if it's old format (not MCP format)
        if "jsonrpc" not in data:
            old_files.append(post_file.stem)
    return old_files

def collect_post(note_id, xsec_token):
    """采集单个帖子"""
    cmd = [
        "./mcp-call.sh", "get_feed_detail",
        json.dumps({"feed_id": note_id, "xsec_token": xsec_token})
    ]
    
    try:
        result = subprocess.run(
            cmd,
            cwd=XHS_DIR,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, f"exit_code_{result.returncode}"
        
        output = result.stdout.strip()
        if not output:
            return False, "empty_response"
        
        # Check for error
        try:
            data = json.loads(output)
            if "error" in data:
                return False, f"api_error"
        except:
            pass
        
        # Save data
        output_file = POSTS_DIR / f"{note_id}.json"
        with open(output_file, "w") as f:
            f.write(output)
        
        return True, None
        
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except Exception as e:
        return False, str(e)

def main():
    print("=" * 50)
    print("重新采集旧格式帖子")
    print("=" * 50)
    
    id_token_map = load_search_results()
    old_files = find_old_format_files()
    
    print(f"需要重新采集: {len(old_files)} 条")
    print()
    
    success = 0
    failed = 0
    
    for i, note_id in enumerate(old_files, 1):
        print(f"[{i}/{len(old_files)}] {note_id}...", end=" ", flush=True)
        
        xsec_token = id_token_map.get(note_id, "")
        if not xsec_token:
            print("❌ 无token")
            failed += 1
            continue
        
        ok, err = collect_post(note_id, xsec_token)
        if ok:
            print("✅ 成功")
            success += 1
        else:
            print(f"❌ {err}")
            failed += 1
        
        time.sleep(4)
    
    print()
    print("=" * 50)
    print(f"完成! 成功: {success}, 失败: {failed}")
    print("=" * 50)

if __name__ == "__main__":
    main()
