#!/usr/bin/env python3
"""
修复剩余的14个失败帖子
"""

import subprocess
import json
import os
import time

OUTPUT_DIR = "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts"
SCRIPT_DIR = "/Users/joeli/.agents/skills/xiaohongshu/scripts"

# 剩余的14个需要修复的帖子
REMAINING_POSTS = [
    {"id": "68872a1f000000002001a8a1", "xsec_token": "ABH6bloeCTamsKQk1jwmeRglffBnLeImRUkISwAAXJltE="},
    {"id": "688bd0f4000000002301b078", "xsec_token": "ABaONeIO_eHXiXLdptZyOKpcXxlEgal5ZAFsd-GBo1LfM="},
    {"id": "68c1b57f000000001d00c132", "xsec_token": "ABjnz5bRP5vIC_N2TGJopEOgIf4KU_yyo1KKsQnltgax8="},
    {"id": "68ddb63200000000040153ba", "xsec_token": "ABYmZsEZ4pNP8sfsbm4zHbhxHUWktaMpRasKAhHrfpHUg="},
    {"id": "69031ede0000000007000645", "xsec_token": "ABnqgr2EEKfSkID35bdrSAjrbjNwK2Qa7K3IAqWg8Dik4="},
    {"id": "690b7c6f000000000703b381", "xsec_token": "ABbxwunjbiZoW_yRc0c6jz5EX4HdP5XLXUt_6XkJNteAg="},
    {"id": "690cf26b000000000401123f", "xsec_token": "ABZU90LmBbUa-yxApWVTiCQ8iJWNNl0tr3bStFa2_jtT0="},
    {"id": "691024250000000003021c19", "xsec_token": "ABj_acke9tTavqbC6A-LrNsEbHDmXNlrfeZyKKlkZZquA="},
    {"id": "69267f9c000000001d038a73", "xsec_token": "ABAzcx7LwqBqelwGeabCA951uFPQwfKx77cwQibTv6zVI="},
    {"id": "6928cb59000000001e02569d", "xsec_token": "ABeLQspkoOY0qeHQqKpYZCY0ITm_jf5gTnYQEZlZJD95c="},
    {"id": "6948d270000000001d03ce8e", "xsec_token": "ABdRUBETnRlTPbhyN4KhejvEvhIu1kOEknV_egTOn0fP8="},
    {"id": "694dc5a3000000002200ba41", "xsec_token": "ABWdaGh86Q6z5up0OLnyN_-RRbz7YgZqw4qjjaOcZkmPs="},
    {"id": "6959bddc000000002203982b", "xsec_token": "ABULjIrdOcRHOp9REs1GyR07xacQfnPOG1CynPZuEpqhg="},
    {"id": "697d2bcd0000000022023751", "xsec_token": "ABdBLzCC6_3kH5_IUIWNR9CLtJd_sQFOa-4mhhmWROskc="}
]

def fetch_post(note_id, xsec_token):
    """获取单个帖子"""
    output_file = os.path.join(OUTPUT_DIR, f"{note_id}.json")
    
    args = json.dumps({
        "feed_id": note_id,
        "xsec_token": xsec_token,
        "load_all_comments": True
    })
    
    try:
        result = subprocess.run(
            ["./mcp-call.sh", "get_feed_detail", args],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            try:
                data = json.loads(result.stdout)
                # 保存到文件
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                # 检查是否有效
                if 'result' in data and 'content' in data['result']:
                    for item in data['result']['content']:
                        if item.get('type') == 'text':
                            text = item.get('text', '')
                            if '失败' in text or 'not found' in text.lower():
                                return False, f"API返回错误: {text[:50]}"
                
                size = os.path.getsize(output_file)
                if size > 1000:
                    return True, f"成功 ({size} bytes)"
                else:
                    return False, f"文件太小 ({size} bytes)"
            except json.JSONDecodeError:
                return False, "JSON解析错误"
        else:
            return False, f"命令失败: {result.stderr[:100]}"
    except Exception as e:
        return False, f"异常: {str(e)[:100]}"

def main():
    print("=" * 60)
    print("修复剩余的14个失败帖子")
    print("=" * 60)
    
    success = 0
    failed = 0
    
    for i, post in enumerate(REMAINING_POSTS, 1):
        note_id = post["id"]
        xsec_token = post["xsec_token"]
        
        print(f"\n[{i}/14] {note_id}")
        ok, msg = fetch_post(note_id, xsec_token)
        if ok:
            print(f"  ✓ {msg}")
            success += 1
        else:
            print(f"  ✗ {msg}")
            failed += 1
        
        time.sleep(2)  # 避免请求过快
    
    print("\n" + "=" * 60)
    print(f"完成! 成功: {success}, 失败: {failed}")
    print("=" * 60)

if __name__ == "__main__":
    main()
