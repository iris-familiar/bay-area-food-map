#!/usr/bin/env python3
"""
验证全部82条帖子的数据完整性
生成验证报告
"""

import json
import os
from datetime import datetime

POSTS_DIR = "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts"
REPORT_FILE = "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/validation_report.json"

def validate_post(file_path):
    """验证单个帖子的完整性"""
    result = {
        "file": os.path.basename(file_path),
        "note_id": os.path.basename(file_path).replace('.json', ''),
        "valid": False,
        "checks": {
            "has_result": False,
            "has_title": False,
            "has_desc": False,
            "has_create_time": False,
            "has_author": False,
            "has_comments": False
        },
        "errors": [],
        "size_bytes": 0,
        "title": None,
        "desc_length": 0
    }
    
    try:
        # 检查文件大小
        result["size_bytes"] = os.path.getsize(file_path)
        
        if result["size_bytes"] < 1000:
            result["errors"].append(f"文件太小 ({result['size_bytes']} bytes)")
            return result
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 检查result字段
        if 'result' not in data:
            result["errors"].append("缺少result字段")
            return result
        result["checks"]["has_result"] = True
        
        result_data = data.get('result', {})
        
        # 检查content
        if 'content' not in result_data:
            result["errors"].append("缺少result.content字段")
            return result
        
        content_items = result_data.get('content', [])
        if not content_items:
            result["errors"].append("content为空数组")
            return result
        
        text_content = ""
        for item in content_items:
            if item.get('type') == 'text':
                text_content = item.get('text', '')
                break
        
        if not text_content:
            result["errors"].append("content中无text类型数据")
            return result
        
        # 检查是否是错误响应（更精确的判断）
        # 只有当错误关键字出现在最开头或作为独立错误消息时才认为是错误
        if text_content.startswith('获取Feed详情失败') or 'not found in noteDetailMap' in text_content:
            result["errors"].append(f"API错误: {text_content[:100]}")
            return result
        
        # 解析JSON内容
        try:
            feed_data = json.loads(text_content)
        except json.JSONDecodeError as e:
            result["errors"].append(f"无法解析content文本为JSON: {str(e)[:50]}")
            return result
        
        # 获取note数据
        note_data = feed_data.get('data', {}).get('note', {})
        
        if not note_data:
            result["errors"].append("缺少data.note字段")
            return result
        
        # 检查title
        title = note_data.get('title', '')
        if title:
            result["checks"]["has_title"] = True
            result["title"] = title[:50] if title else None
        else:
            result["errors"].append("缺少title字段")
        
        # 检查desc
        desc = note_data.get('desc', '')
        if desc and len(desc) > 50:
            result["checks"]["has_desc"] = True
            result["desc_length"] = len(desc)
        else:
            result["errors"].append(f"desc字段无效 (长度: {len(desc)})")
        
        # 检查time (create_time)
        if note_data.get('time'):
            result["checks"]["has_create_time"] = True
        else:
            result["errors"].append("缺少time字段")
        
        # 检查author (user)
        if note_data.get('user'):
            result["checks"]["has_author"] = True
        else:
            result["errors"].append("缺少user字段")
        
        # 检查comments
        comments_data = feed_data.get('data', {}).get('comments', {})
        if comments_data and 'list' in comments_data:
            result["checks"]["has_comments"] = True
        else:
            result["errors"].append("缺少comments字段")
        
        # 判断是否有效（至少5个检查通过）
        passed = sum(result["checks"].values())
        if passed >= 5:
            result["valid"] = True
        else:
            result["errors"].append(f"检查通过率低 ({passed}/6)")
        
    except json.JSONDecodeError as e:
        result["errors"].append(f"JSON解析错误: {str(e)[:50]}")
    except Exception as e:
        result["errors"].append(f"处理错误: {str(e)[:50]}")
    
    return result

def main():
    print("=" * 70)
    print("开始验证82条帖子数据完整性")
    print("=" * 70)
    
    # 获取所有帖子文件
    json_files = sorted([f for f in os.listdir(POSTS_DIR) if f.endswith('.json')])
    total = len(json_files)
    
    print(f"\n共找到 {total} 个帖子文件")
    print("正在验证中...")
    print()
    
    valid_count = 0
    invalid_count = 0
    validation_details = []
    
    for i, filename in enumerate(json_files, 1):
        file_path = os.path.join(POSTS_DIR, filename)
        result = validate_post(file_path)
        validation_details.append(result)
        
        if result["valid"]:
            valid_count += 1
            status = "✓"
        else:
            invalid_count += 1
            status = "✗"
        
        title = result.get("title", "N/A") or "N/A"
        size_kb = result['size_bytes'] / 1024
        print(f"[{i:2d}/{total}] {status} {filename[:26]} | 大小: {size_kb:6.1f}KB | 标题: {title[:25]}")
    
    # 生成报告
    report = {
        "timestamp": datetime.now().isoformat(),
        "total_posts": total,
        "valid_posts": valid_count,
        "invalid_posts": invalid_count,
        "validation_rate": round(valid_count / total * 100, 2) if total > 0 else 0,
        "summary": {
            "files_with_result": sum(1 for v in validation_details if v["checks"]["has_result"]),
            "files_with_title": sum(1 for v in validation_details if v["checks"]["has_title"]),
            "files_with_desc": sum(1 for v in validation_details if v["checks"]["has_desc"]),
            "files_with_create_time": sum(1 for v in validation_details if v["checks"]["has_create_time"]),
            "files_with_author": sum(1 for v in validation_details if v["checks"]["has_author"]),
            "files_with_comments": sum(1 for v in validation_details if v["checks"]["has_comments"])
        },
        "invalid_details": [
            {
                "file": v["file"],
                "note_id": v["note_id"],
                "size_bytes": v["size_bytes"],
                "errors": v["errors"]
            }
            for v in validation_details if not v["valid"]
        ],
        "valid_details": [
            {
                "file": v["file"],
                "note_id": v["note_id"],
                "title": v.get("title"),
                "desc_length": v.get("desc_length", 0)
            }
            for v in validation_details if v["valid"]
        ],
        "validation_details": validation_details
    }
    
    # 保存报告
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    # 输出摘要
    print("\n" + "=" * 70)
    print("验证完成!")
    print("=" * 70)
    print(f"\n📊 总计帖子: {total}")
    print(f"✅ 有效帖子: {valid_count} ({report['validation_rate']}%)")
    print(f"❌ 无效帖子: {invalid_count}")
    print(f"\n📋 详细检查:")
    print(f"  - 有result字段:   {report['summary']['files_with_result']:2d}")
    print(f"  - 有title字段:    {report['summary']['files_with_title']:2d}")
    print(f"  - 有desc字段:     {report['summary']['files_with_desc']:2d}")
    print(f"  - 有create_time:  {report['summary']['files_with_create_time']:2d}")
    print(f"  - 有author字段:   {report['summary']['files_with_author']:2d}")
    print(f"  - 有comments字段: {report['summary']['files_with_comments']:2d}")
    print(f"\n💾 报告已保存到: {REPORT_FILE}")
    print("=" * 70)

if __name__ == "__main__":
    main()
