#!/usr/bin/env python3
"""
批量修复21个失败的帖子
"""

import json
import subprocess
import os
import time

OUTPUT_DIR = "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts"

# 21个失败帖子
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

def is_fixed(file_path):
    """检查文件是否已经修复（大小>1KB）"""
    if os.path.exists(file_path):
        size = os.path.getsize(file_path)
        return size > 1000
    return False

def fetch_with_mcp(note_id, xsec_token, output_file):
    """使用mcp-call.sh获取数据"""
    skill_dir = "/Users/joeli/.agents/skills/xiaohongshu"
    script_path = os.path.join(skill_dir, "scripts", "mcp-call.sh")
    
    if not os.path.exists(script_path):
        print(f"  ✗ mcp-call.sh not found: {script_path}")
        return False
    
    # 构建参数
    args = json.dumps({
        "feed_id": note_id,
        "xsec_token": xsec_token,
        "load_all_comments": True
    })
    
    try:
        with open(output_file, 'w') as f:
            result = subprocess.run(
                [script_path, "get_feed_detail", args],
                stdout=f,
                stderr=subprocess.PIPE,
                cwd=os.path.join(skill_dir, "scripts"),
                timeout=60
            )
        
        # 检查结果
        if os.path.exists(output_file):
            size = os.path.getsize(output_file)
            if size > 1000:
                return True
            else:
                # 可能是错误响应，读取内容检查
                with open(output_file, 'r') as f:
                    content = f.read()
                if 'result' in content and 'content' in content:
                    return True
        return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("开始修复21个失败帖子")
    print("=" * 60)
    
    success = 0
    failed = 0
    already_fixed = 0
    
    for i, post in enumerate(FAILED_POSTS, 1):
        note_id = post["id"]
        xsec_token = post["xsec_token"]
        output_file = os.path.join(OUTPUT_DIR, f"{note_id}.json")
        
        print(f"\n[{i}/21] 处理: {note_id}")
        
        # 检查是否已修复
        if is_fixed(output_file):
            print(f"  ✓ 已经修复，跳过")
            already_fixed += 1
            success += 1
            continue
        
        # 尝试获取数据
        if fetch_with_mcp(note_id, xsec_token, output_file):
            size = os.path.getsize(output_file)
            print(f"  ✓ 成功修复 ({size} bytes)")
            success += 1
        else:
            print(f"  ✗ 修复失败")
            failed += 1
        
        time.sleep(0.5)
    
    print("\n" + "=" * 60)
    print("修复完成!")
    print(f"  已修复: {already_fixed}")
    print(f"  新成功: {success - already_fixed}")
    print(f"  失败: {failed}")
    print("=" * 60)

if __name__ == "__main__":
    main()
