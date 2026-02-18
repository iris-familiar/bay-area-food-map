#!/usr/bin/env python3
"""
采集小红书帖子详情 - Python版本
更可靠的错误处理和进度追踪
"""

import json
import os
import subprocess
import time
from pathlib import Path

# 配置
PROJECT_DIR = Path("/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map")
DATA_DIR = PROJECT_DIR / "data/raw/v2"
XHS_DIR = Path("/Users/joeli/.agents/skills/xiaohongshu/scripts")
FAILED_LOG = DATA_DIR / "failed_notes.log"
PROGRESS_LOG = DATA_DIR / "collection_progress.log"
POSTS_DIR = DATA_DIR / "posts"

# 创建目录
POSTS_DIR.mkdir(parents=True, exist_ok=True)

def load_search_results():
    """加载搜索结果获取所有note_id和xsec_token"""
    with open(PROJECT_DIR / "data/raw/phase1a_search_results.json", "r") as f:
        data = json.load(f)
    
    # 构建id到token的映射
    id_token_map = {}
    for post in data["posts"]:
        note_id = post["id"]
        token = post.get("xsecToken", "")
        if note_id and token and note_id not in id_token_map:
            id_token_map[note_id] = token
    
    return id_token_map

def get_collected_ids():
    """获取已采集的ID列表"""
    collected = set()
    if POSTS_DIR.exists():
        for f in POSTS_DIR.glob("*.json"):
            collected.add(f.stem)
    return collected

def collect_post(note_id, xsec_token):
    """
    采集单个帖子
    返回: (success: bool, data: dict or error_msg: str)
    """
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
        
        # 检查是否有错误
        try:
            data = json.loads(output)
            if "error" in data:
                return False, f"api_error: {data['error']}"
        except json.JSONDecodeError:
            pass
        
        # 保存数据
        output_file = POSTS_DIR / f"{note_id}.json"
        with open(output_file, "w") as f:
            f.write(output)
        
        return True, output_file
        
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except Exception as e:
        return False, f"exception: {str(e)}"

def log_progress(count, total, current_total):
    """记录进度"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(PROGRESS_LOG, "a") as f:
        f.write(f"{timestamp} - Progress: {count}/{total} | Total posts: {current_total}\n")

def log_failed(note_id, reason):
    """记录失败"""
    with open(FAILED_LOG, "a") as f:
        f.write(f"{note_id}|{reason}\n")

def main():
    print("=" * 50)
    print("开始采集剩余帖子")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)
    
    # 加载数据
    id_token_map = load_search_results()
    collected_ids = get_collected_ids()
    
    # 找出未采集的ID
    remaining_ids = []
    for note_id, token in id_token_map.items():
        if note_id not in collected_ids:
            remaining_ids.append((note_id, token))
    
    total_remaining = len(remaining_ids)
    print(f"总帖子数: {len(id_token_map)}")
    print(f"已采集: {len(collected_ids)}")
    print(f"待采集: {total_remaining}")
    print()
    
    # 清空失败日志
    if FAILED_LOG.exists():
        FAILED_LOG.unlink()
    
    # 开始采集
    success_count = 0
    fail_count = 0
    
    for i, (note_id, xsec_token) in enumerate(remaining_ids, 1):
        print(f"[{i}/{total_remaining}] 处理: {note_id}")
        
        if not xsec_token:
            print(f"  ⚠️ 无token，跳过")
            log_failed(note_id, "missing_token")
            fail_count += 1
            continue
        
        # 尝试采集（最多2次）
        collected = False
        for attempt in range(1, 3):
            print(f"  尝试 {attempt}...", end=" ", flush=True)
            success, result = collect_post(note_id, xsec_token)
            
            if success:
                print("✅ 成功")
                success_count += 1
                collected = True
                break
            else:
                print(f"❌ 失败: {result}")
                if attempt < 2:
                    time.sleep(2)
        
        if not collected:
            log_failed(note_id, result)
            fail_count += 1
        
        # 记录进度
        current_total = len(get_collected_ids())
        log_progress(i, total_remaining, current_total)
        
        # 每10条输出进度
        if i % 10 == 0:
            print()
            print(f"📊 进度: {i}/{total_remaining} | 成功: {success_count} | 失败: {fail_count} | 总计: {current_total}")
            print()
        
        # 控制请求频率
        time.sleep(4)
    
    # 完成统计
    final_total = len(get_collected_ids())
    print()
    print("=" * 50)
    print("采集完成!")
    print(f"结束时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"成功: {success_count} | 失败: {fail_count}")
    print(f"总帖子数: {final_total} / {len(id_token_map)}")
    print("=" * 50)
    
    # 生成报告
    generate_report(final_total, fail_count)

def generate_report(total_posts, failed_count):
    """生成采集报告"""
    report_file = DATA_DIR / "collection_complete_report.md"
    
    failed_content = ""
    if FAILED_LOG.exists():
        with open(FAILED_LOG) as f:
            failed_content = f.read().strip() or "无"
    
    report = f"""# 数据采集完成报告

生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}

## 采集统计

- 总帖子数: {total_posts} / 82 (唯一ID数)
- 失败记录数: {failed_count}

## 失败记录

{failed_content}

## 数据验证清单

- [ ] 所有帖子都有content字段 (desc)
- [ ] 所有帖子都有create_time (time字段)
- [ ] 评论数据完整性 (comments字段)

## 文件位置

- 帖子数据: `{POSTS_DIR}`
- 失败日志: `{FAILED_LOG}`
- 进度日志: `{PROGRESS_LOG}`
"""
    
    with open(report_file, "w") as f:
        f.write(report)
    
    print(f"\n报告已生成: {report_file}")

if __name__ == "__main__":
    main()
