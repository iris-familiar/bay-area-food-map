#!/usr/bin/env python3
"""
湾区美食地图 - 数据验证脚本
每次改动后自动运行，确保数据质量
"""

import json
import sys
from pathlib import Path

def validate_restaurant_data(data_path: str) -> dict:
    """
    验证餐厅数据完整性
    
    Returns:
        {
            "valid": bool,
            "total": int,
            "errors": [],
            "warnings": [],
            "stats": {}
        }
    """
    result = {
        "valid": True,
        "total": 0,
        "errors": [],
        "warnings": [],
        "stats": {
            "by_type": {},
            "by_area": {},
            "verified_count": 0,
            "recommended_count": 0,
            "not_recommended_count": 0
        }
    }
    
    # 1. 文件存在性检查
    path = Path(data_path)
    if not path.exists():
        result["valid"] = False
        result["errors"].append(f"❌ 数据文件不存在: {data_path}")
        return result
    
    # 2. JSON格式验证
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        result["valid"] = False
        result["errors"].append(f"❌ JSON格式错误: {e}")
        return result
    except Exception as e:
        result["valid"] = False
        result["errors"].append(f"❌ 读取文件失败: {e}")
        return result
    
    # 3. 基础结构检查
    if "restaurants" not in data:
        result["valid"] = False
        result["errors"].append("❌ 缺少 'restaurants' 字段")
        return result
    
    restaurants = data.get("restaurants", [])
    result["total"] = len(restaurants)
    
    # 4. 餐厅数量检查
    if len(restaurants) < 10:
        result["warnings"].append(f"⚠️ 餐厅数量过少: 仅 {len(restaurants)} 家")
    
    # 5. 每个餐厅的字段验证
    required_fields = ["id", "name", "type", "area", "status"]
    optional_but_important = ["address", "google_rating", "metrics"]
    
    for idx, r in enumerate(restaurants):
        prefix = f"餐厅[{idx}] '{r.get('name', 'UNKNOWN')}'"
        
        # 必需字段
        for field in required_fields:
            if field not in r:
                result["valid"] = False
                result["errors"].append(f"❌ {prefix} 缺少必需字段: {field}")
        
        # 重要字段警告
        for field in optional_but_important:
            if field not in r or not r[field]:
                result["warnings"].append(f"⚠️ {prefix} 缺少重要字段: {field}")
        
        # metrics 结构验证
        if "metrics" in r and r["metrics"]:
            metrics = r["metrics"]
            if "sentiment_analysis" not in metrics:
                result["warnings"].append(f"⚠️ {prefix} 缺少 sentiment_analysis")
            if "discussion_volume" not in metrics:
                result["warnings"].append(f"⚠️ {prefix} 缺少 discussion_volume")
        
        # 统计数据
        r_type = r.get("type", "未知")
        r_area = r.get("area", "未知")
        result["stats"]["by_type"][r_type] = result["stats"]["by_type"].get(r_type, 0) + 1
        result["stats"]["by_area"][r_area] = result["stats"]["by_area"].get(r_area, 0) + 1
        
        if r.get("verified"):
            result["stats"]["verified_count"] += 1
        
        if r.get("status") == "recommended":
            result["stats"]["recommended_count"] += 1
        elif r.get("status") == "not_recommended":
            result["stats"]["not_recommended_count"] += 1
    
    # 6. ID唯一性检查
    ids = [r.get("id") for r in restaurants if r.get("id")]
    if len(ids) != len(set(ids)):
        duplicates = [id for id in ids if ids.count(id) > 1]
        result["valid"] = False
        result["errors"].append(f"❌ 发现重复ID: {set(duplicates)}")
    
    # 7. 餐厅名称规范检查 - 检测"斜杠分隔多个餐厅名"的模式
    for idx, r in enumerate(restaurants):
        name = r.get("name", "")
        if "/" in name or " / " in name:
            result["valid"] = False
            result["errors"].append(
                f"❌ 餐厅[{idx}] '{name}' 名称包含斜杠，可能是多个餐厅合并: "
                f"请拆分为独立记录 (如 'Mikiya / Chubby Cattle' → 'Mikiya' 和 'Chubby Cattle')"
            )
    
    # 8. 元数据检查
    if "version" not in data:
        result["warnings"].append("⚠️ 缺少 version 字段")
    if "updated_at" not in data:
        result["warnings"].append("⚠️ 缺少 updated_at 字段")
    
    return result


def validate_html_embedded_data(html_path: str) -> dict:
    """验证HTML中嵌入的数据"""
    result = {
        "valid": True,
        "restaurant_count": 0,
        "errors": [],
        "warnings": []
    }
    
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        result["valid"] = False
        result["errors"].append(f"❌ 读取HTML失败: {e}")
        return result
    
    # 统计嵌入的餐厅数量
    result["restaurant_count"] = content.count('"id":')
    
    if result["restaurant_count"] == 0:
        result["warnings"].append("⚠️ HTML中未找到嵌入数据")
    elif result["restaurant_count"] < 20:
        result["warnings"].append(f"⚠️ HTML中餐厅数量可能不完整: {result['restaurant_count']} 家")
    
    return result


def print_report(json_result: dict, html_result: dict):
    """打印验证报告"""
    print("=" * 60)
    print("🍜 湾区美食地图 - 数据验证报告")
    print("=" * 60)
    
    # JSON数据状态
    print(f"\n📊 JSON数据文件:")
    print(f"   餐厅总数: {json_result['total']}")
    print(f"   验证状态: {'✅ 通过' if json_result['valid'] else '❌ 失败'}")
    
    if json_result['stats']['by_type']:
        print(f"\n   按菜系分布:")
        for ctype, count in sorted(json_result['stats']['by_type'].items()):
            print(f"      {ctype}: {count}家")
    
    print(f"\n   按区域分布:")
    for area, count in sorted(json_result['stats']['by_area'].items(), key=lambda x: -x[1]):
        print(f"      {area}: {count}家")
    
    print(f"\n   其他统计:")
    print(f"      ✅ 已验证: {json_result['stats']['verified_count']}家")
    print(f"      👍 推荐: {json_result['stats']['recommended_count']}家")
    print(f"      👎 避雷: {json_result['stats']['not_recommended_count']}家")
    
    # HTML嵌入数据状态
    print(f"\n📄 HTML嵌入数据:")
    print(f"   餐厅数量: {html_result['restaurant_count']}")
    print(f"   状态: {'✅ 正常' if html_result['valid'] else '❌ 异常'}")
    
    # 错误和警告
    if json_result['errors'] or html_result['errors']:
        print(f"\n❌ 错误 ({len(json_result['errors']) + len(html_result['errors'])}):")
        for error in json_result['errors'] + html_result['errors']:
            print(f"   {error}")
    
    if json_result['warnings'] or html_result['warnings']:
        print(f"\n⚠️ 警告 ({len(json_result['warnings']) + len(html_result['warnings'])}):")
        for warning in json_result['warnings'][:10]:  # 只显示前10个
            print(f"   {warning}")
        if len(json_result['warnings']) > 10:
            print(f"   ... 还有 {len(json_result['warnings']) - 10} 个警告")
    
    print("\n" + "=" * 60)
    
    # 最终状态
    if json_result['valid'] and html_result['valid']:
        print("✅ 数据验证通过")
        return 0
    else:
        print("❌ 数据验证失败，请修复上述问题")
        return 1


def main():
    """主函数"""
    json_path = "projects/bay-area-food-map/data/current/restaurant_database.json"
    html_path = "projects/bay-area-food-map/index.html"
    
    # 验证JSON数据
    json_result = validate_restaurant_data(json_path)
    
    # 验证HTML嵌入数据
    html_result = validate_html_embedded_data(html_path)
    
    # 打印报告
    exit_code = print_report(json_result, html_result)
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
