#!/usr/bin/env python3
"""
批量修复失败的21个帖子
使用正确的feed_id和xsec_token重新获取数据
"""

import json
import subprocess
import os
import time

# 21个失败帖子的ID和对应的xsec_token
FAILED_POSTS = [
    {"id": "66667292000000000f00f266", "xsec_token": "ABepYsThia3Y2-1Y2UZAB7vQjuEjffXumjuICHPHRi6ww="},
    {"id": "69607392000000000a03362c", "xsec_token": "AB5jdyXT2153KteVkLhHHnYqJaONxjBeJ1ebNXabMQqiU="},
    {"id": "69267f9c000000001d038a73", "xsec_token": "ABAzcx7LwqBqelwGeabCA951uFPQwfKx77cwQibTv6zVI="},
    {"id": "68bb9f83000000001b02386a", "xsec_token": "ABjgWXOuq_LOByHnTg809Zo-Pj-T8zFaP2J0jmqtNQYNI="},
    {"id": "6923764a000000001f00cd7c", "xsec_token": "AB70cetXGsTodsvrY10u4lOlkVN4qkOFpd6yOjUjQ8uHk="},
    {"id": "694a0149000000001f007d63", "xsec_token": "ABomYfSEDHkJ8duq3nhHvx3aJPSno05tTf06bU2LczCVw="},
    {"id": "68df433c000000000701726b", "xsec_token": "ABGamp6-7RepfvcUc81xZSfo8DZb4F1u6lAXJ4WBCj1qw="},
    {"id": "69388a61000000001e038496", "xsec_token": "ABdhoFK-kgpy9uVBxwOYoTAxBCDagW5lXRnVpTKNsTYt8="},
    {"id": "688bd0f4000000002301b078", "xsec_token": "ABaONeIO_eHXiXLdptZyOKpcXxlEgal5ZAFsd-GBo1LfM="},
    {"id": "6948d270000000001d03ce8e", "xsec_token": "ABdRUBETnRlTPbhyN4KhejvEvhIu1kOEknV_egTOn0fP8="},
    {"id": "690b7c6f000000000703b381", "xsec_token": "ABbxwunjbiZoW_yRc0c6jz5EX4HdP5XLXUt_6XkJNteAg="},
    {"id": "68ddb63200000000040153ba", "xsec_token": "ABYmZsEZ4pNP8sfsbm4zHbhxHUWktaMpRasKAhHrfpHUg="},
    {"id": "6959bddc000000002203982b", "xsec_token": "ABULjIrdOcRHOp9REs1GyR07xacQfnPOG1CynPZuEpqhg="},
    {"id": "6928cb59000000001e02569d", "xsec_token": "ABeLQspkoOY0qeHQqKpYZCY0ITm_jf5gTnYQEZlZJD95c="},
    {"id": "68c1b57f000000001d00c132", "xsec_token": "ABjnz5bRP5vIC_N2TGJopEOgIf4KU_yyo1KKsQnltgax8="},
    {"id": "690cf26b000000000401123f", "xsec_token": "ABZU90LmBbUa-yxApWVTiCQ8iJWNNl0tr3bStFa2_jtT0="},
    {"id": "691024250000000003021c19", "xsec_token": "ABj_acke9tTavqbC6A-LrNsEbHDmXNlrfeZyKKlkZZquA="},
    {"id": "69031ede0000000007000645", "xsec_token": "ABnqgr2EEKfSkID35bdrSAjrbjNwK2Qa7K3IAqWg8Dik4="},
    {"id": "697d2bcd0000000022023751", "xsec_token": "ABdBLzCC6_3kH5_IUIWNR9CLtJd_sQFOa-4mhhmWROskc="},
    {"id": "694dc5a3000000002200ba41", "xsec_token": "ABWdaGh86Q6z5up0OLnyN_-RRbz7YgZqw4qjjaOcZkmPs="},
    {"id": "68872a1f000000002001a8a1", "xsec_token": "ABH6bloeCTamsKQk1jwmeRglffBnLeImRUkISwAAXJltE="}
]

OUTPUT_DIR = "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts"

def fetch_post_with_curl(note_id, xsec_token):
    """使用curl直接调用MCP服务器获取帖子详情"""
    
    # 构建JSON-RPC请求
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "get_feed_detail",
            "arguments": {
                "feed_id": note_id,
                "xsec_token": xsec_token,
                "load_all_comments": True
            }
        },
        "id": 1
    }
    
    # 使用curl调用MCP服务器
    cmd = [
        "curl", "-s", "-X", "POST",
        "http://localhost:3000/mcp",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"  ✗ Error for {note_id}: {result.stderr}")
            return None
    except Exception as e:
        print(f"  ✗ Exception for {note_id}: {e}")
        return None

def main():
    print("=" * 60)
    print("开始修复21个失败帖子")
    print("=" * 60)
    
    success_count = 0
    failed_count = 0
    failed_ids = []
    
    for i, post in enumerate(FAILED_POSTS, 1):
        note_id = post["id"]
        xsec_token = post["xsec_token"]
        
        print(f"\n[{i}/21] 修复帖子: {note_id}")
        
        # 获取数据
        data = fetch_post_with_curl(note_id, xsec_token)
        
        if data and "result" in data:
            # 保存文件
            output_path = os.path.join(OUTPUT_DIR, f"{note_id}.json")
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 检查内容是否有效
            content_text = json.dumps(data)
            if len(content_text) > 1000:
                print(f"  ✓ 成功获取 ({len(content_text)} bytes)")
                success_count += 1
            else:
                print(f"  ⚠ 获取成功但内容可能无效 ({len(content_text)} bytes)")
                failed_count += 1
                failed_ids.append(note_id)
        else:
            print(f"  ✗ 获取失败")
            failed_count += 1
            failed_ids.append(note_id)
        
        # 延迟避免请求过快
        time.sleep(1)
    
    print("\n" + "=" * 60)
    print("修复完成!")
    print(f"  成功: {success_count}")
    print(f"  失败: {failed_count}")
    if failed_ids:
        print(f"  失败ID: {failed_ids}")
    print("=" * 60)

if __name__ == "__main__":
    main()
