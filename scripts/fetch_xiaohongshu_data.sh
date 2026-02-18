#!/bin/bash
#
# 小红书数据获取脚本 - 批量搜索版
# 用于扩展bay-area-food-map的数据源
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="${HOME}/.agents/skills/xiaohongshu/scripts"
RAW_DIR="${SCRIPT_DIR}/../raw"
DATA_DIR="${SCRIPT_DIR}/../data"

# 确保目录存在
mkdir -p "${RAW_DIR}"
mkdir -p "${DATA_DIR}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== 湾区美食地图 - 小红书数据获取脚本 ===${NC}"
echo ""

# 搜索关键词矩阵
# 格式: "关键词|最小评论数|描述"
SEARCH_QUERIES=(
    # 核心大词
    "湾区餐厅推荐|10|核心推荐"
    "湾区美食|10|美食综合"
    "湾区探店|5|探店分享"
    
    # 地理+菜系
    "旧金山中餐|5|旧金山中餐"
    "旧金山川菜|3|旧金山川菜"
    "南湾餐厅|10|南湾餐厅"
    "南湾中餐|5|南湾中餐"
    "Cupertino餐厅|5|Cupertino"
    "Cupertino中餐|3|Cupertino中餐"
    "Palo Alto餐厅|5|Palo Alto"
    "Fremont餐厅|5|Fremont"
    "Fremont中餐|3|Fremont中餐"
    "东湾餐厅|5|东湾餐厅"
    "东湾中餐|3|东湾中餐"
    "Union City餐厅|3|Union City"
    "半岛餐厅|3|半岛餐厅"
    
    # 菜系专项
    "湾区川菜|5|川菜"
    "湾区湘菜|5|湘菜"
    "湾区火锅|5|火锅"
    "湾区烧烤|5|烧烤"
    "湾区日料|5|日料"
    "湾区寿司|3|寿司"
    "湾区拉面|3|拉面"
    "湾区韩餐|5|韩餐"
    "湾区烤肉|5|烤肉"
    "湾区越南菜|3|越南菜"
    "湾区早茶|3|早茶"
    "湾区东北菜|3|东北菜"
    "湾区上海菜|3|上海菜"
    "湾区麻辣烫|3|麻辣烫"
    
    # 场景
    "湾区约会餐厅|3|约会"
    "湾区聚餐|3|聚餐"
    "湾区一人食|3|一人食"
    "湾区外卖|3|外卖"
    "湾区夜宵|3|夜宵"
    
    # 特定需求
    "湾区踩雷|3|避雷"
    "湾区避雷|3|避雷"
    "湾区拔草|3|拔草"
    "湾区必吃|5|必吃"
    "湾区宝藏餐厅|5|宝藏"
)

# 检查依赖
check_dependencies() {
    echo -e "${YELLOW}检查依赖...${NC}"
    
    if [ ! -d "${MCP_DIR}" ]; then
        echo -e "${RED}错误: 小红书skill未安装${NC}"
        echo "请运行: clawhub install xiaohongshu"
        exit 1
    fi
    
    if [ ! -f "${MCP_DIR}/mcp-call.sh" ]; then
        echo -e "${RED}错误: mcp-call.sh 不存在${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
    echo ""
}

# 搜索单个关键词
search_keyword() {
    local query="$1"
    local min_comments="$2"
    local desc="$3"
    
    echo -e "${YELLOW}搜索: ${query} (${desc})${NC}"
    
    # 调用小红书搜索 (移除num参数)
    local result
    result=$(cd "${MCP_DIR}" && ./mcp-call.sh search_feeds "{\"keyword\": \"${query}\"}" 2>/dev/null) || {
        echo -e "${RED}  ✗ 搜索失败: ${query}${NC}"
        return 1
    }
    
    # 解析结果并筛选
    local feeds
    feeds=$(echo "${result}" | jq -r '.feeds[]? | select(.interactInfo.commentCount >='"${min_comments}"') | [.id, .xsecToken, .interactInfo.commentCount, .title[:50]] | @tsv' 2>/dev/null)
    
    if [ -z "${feeds}" ]; then
        echo -e "${YELLOW}  ⚠ 无符合质量标准的帖子${NC}"
        return 0
    fi
    
    local count=0
    while IFS=$'\t' read -r feed_id xsec_token comment_count title; do
        local output_file="${RAW_DIR}/feed_${feed_id}_detail.json"
        
        # 跳过已存在的
        if [ -f "${output_file}" ]; then
            echo -e "${GREEN}  ✓ 已存在: ${title:0:30}... (${comment_count}评论)${NC}"
            continue
        fi
        
        echo -e "${YELLOW}  → 获取详情: ${title:0:30}...${NC}"
        
        # 获取详情 (带所有评论)
        local detail
        detail=$(cd "${MCP_DIR}" && ./mcp-call.sh get_feed_detail "{\"feed_id\": \"${feed_id}\", \"xsec_token\": \"${xsec_token}\", \"load_all_comments\": true}" 2>/dev/null) || {
            echo -e "${RED}    ✗ 获取失败${NC}"
            continue
        }
        
        # 保存
        echo "${detail}" > "${output_file}"
        echo -e "${GREEN}    ✓ 已保存${NC}"
        ((count++))
        
        # 防封策略: 随机延迟 3-8秒
        local delay=$((RANDOM % 6 + 3))
        sleep $delay
        
        # 每获取5个帖子后长休息
        if [ $((count % 5)) -eq 0 ]; then
            echo -e "${BLUE}    ⏱ 长休息 (15秒)...${NC}"
            sleep 15
        fi
    done <<< "${feeds}"
    
    echo -e "${GREEN}  ✓ 新增 ${count} 个帖子${NC}"
    echo ""
}

# 批量搜索
batch_search() {
    echo -e "${GREEN}=== 开始批量搜索 ===${NC}"
    echo "目标: ${#SEARCH_QUERIES[@]} 个关键词"
    echo "策略: 减少单次搜索数量，增加随机延迟，避免触发限制"
    echo ""
    
    local total_new=0
    local query_count=0
    
    # 分批执行，每批5个关键词后长休息
    for query_info in "${SEARCH_QUERIES[@]}"; do
        IFS='|' read -r query min_comments desc <<< "${query_info}"
        
        search_keyword "${query}" "${min_comments}" "${desc}"
        ((query_count++))
        
        # 每3个关键词后长休息 (防封策略)
        if [ $((query_count % 3)) -eq 0 ]; then
            local long_delay=$((RANDOM % 10 + 20))  # 20-30秒
            echo -e "${BLUE}⏱ 批次休息 (${long_delay}秒)...${NC}"
            sleep $long_delay
        else
            # 关键词间随机延迟 8-15秒
            local delay=$((RANDOM % 8 + 8))
            sleep $delay
        fi
        
        # 每10个关键词后超长休息
        if [ $((query_count % 10)) -eq 0 ]; then
            echo -e "${BLUE}⏱ 阶段休息 (60秒)...${NC}"
            sleep 60
        fi
    done
    
    echo -e "${GREEN}=== 搜索完成 ===${NC}"
}

# 统计当前数据
show_stats() {
    echo ""
    echo -e "${GREEN}=== 数据概览 ===${NC}"
    
    local total_feeds
    total_feeds=$(find "${RAW_DIR}" -name "feed_*_detail.json" | wc -l)
    
    local total_size
    total_size=$(du -sh "${RAW_DIR}" | cut -f1)
    
    echo "已获取帖子数: ${total_feeds}"
    echo "数据总大小: ${total_size}"
    echo ""
    
    # 统计评论数
    local total_comments=0
    for file in "${RAW_DIR}"/feed_*_detail.json; do
        if [ -f "$file" ]; then
            local comments
            comments=$(jq -r '.comments? | length // 0' "$file" 2>/dev/null)
            total_comments=$((total_comments + comments))
        fi
    done
    
    echo "总评论数: ${total_comments}"
    echo ""
}

# 质量报告
quality_report() {
    echo -e "${GREEN}=== 质量检查报告 ===${NC}"
    
    local low_quality=0
    local high_quality=0
    
    for file in "${RAW_DIR}"/feed_*_detail.json; do
        if [ ! -f "$file" ]; then continue; fi
        
        local comment_count
        comment_count=$(jq -r '.comments? | length // 0' "$file")
        
        if [ "$comment_count" -lt 5 ]; then
            ((low_quality++))
        else
            ((high_quality++))
        fi
    done
    
    echo "高质量帖子 (≥5评论): ${high_quality}"
    echo "低质量帖子 (<5评论): ${low_quality}"
    echo ""
}

# 主函数
main() {
    case "${1:-}" in
        search)
            check_dependencies
            batch_search
            show_stats
            ;;
        stats)
            show_stats
            quality_report
            ;;
        clean)
            echo -e "${RED}清理数据...${NC}"
            read -p "确定要删除所有raw数据吗? (y/N) " confirm
            if [ "$confirm" = "y" ]; then
                rm -f "${RAW_DIR}"/feed_*.json
                echo -e "${GREEN}已清理${NC}"
            fi
            ;;
        *)
            echo "使用方式:"
            echo "  $0 search    - 执行批量搜索"
            echo "  $0 stats     - 显示数据统计"
            echo "  $0 clean     - 清理raw数据"
            echo ""
            echo "注意: 首次运行前确保小红书skill已启动:"
            echo "  cd ~/.agents/skills/xiaohongshu/scripts && ./start-mcp.sh"
            ;;
    esac
}

main "$@"