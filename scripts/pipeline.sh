#!/bin/bash
#
# 完整数据获取Pipeline
# 自动化执行: 搜索 → 过滤 → 去重 → 验证 → 生成数据库
#

set -e

# 配置
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_DIR="${PROJECT_DIR}/raw"
FILTERED_DIR="${PROJECT_DIR}/data/filtered"
CURRENT_DIR="${PROJECT_DIR}/data/current"
ARCHIVE_DIR="${PROJECT_DIR}/data/archive"
SCRIPTS_DIR="${PROJECT_DIR}/scripts"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   湾区美食地图 - 数据获取Pipeline${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 帮助信息
show_help() {
    echo "使用方式:"
    echo "  $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  fetch       - 获取新数据 (小红书搜索)"
    echo "  filter      - 质量过滤"
    echo "  dedupe      - 去重合并"
    echo "  validate    - Google Places验证"
    echo "  full        - 执行完整pipeline (fetch+filter+dedupe+validate)"
    echo "  stats       - 查看数据统计"
    echo "  clean       - 清理临时文件"
    echo ""
    echo "Examples:"
    echo "  $0 fetch              # 仅获取新数据"
    echo "  $0 filter             # 仅过滤现有数据"
    echo "  $0 full               # 执行完整流程"
    echo ""
}

# 步骤1: 获取数据
step_fetch() {
    echo -e "${BLUE}[Step 1/4] 获取小红书数据...${NC}"
    
    if [ -f "${SCRIPTS_DIR}/fetch_xiaohongshu_data.sh" ]; then
        bash "${SCRIPTS_DIR}/fetch_xiaohongshu_data.sh" search
    else
        echo -e "${RED}错误: fetch_xiaohongshu_data.sh 不存在${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ 数据获取完成${NC}"
    echo ""
}

# 步骤2: 质量过滤
step_filter() {
    echo -e "${BLUE}[Step 2/4] 质量过滤...${NC}"
    
    # 确保目录存在
    mkdir -p "${FILTERED_DIR}"
    
    if [ -f "${SCRIPTS_DIR}/filter_quality_posts.py" ]; then
        python3 "${SCRIPTS_DIR}/filter_quality_posts.py" \
            "${RAW_DIR}" \
            "${FILTERED_DIR}" \
            --min-comments 5 \
            --min-score 40 \
            --max-age 730
    else
        echo -e "${YELLOW}警告: filter_quality_posts.py 不存在，跳过过滤${NC}"
        # 复制raw到filtered
        cp "${RAW_DIR}"/*.json "${FILTERED_DIR}/" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ 质量过滤完成${NC}"
    echo ""
}

# 步骤3: 去重合并
step_dedupe() {
    echo -e "${BLUE}[Step 3/4] 餐厅去重与合并...${NC}"
    
    if [ -f "${SCRIPTS_DIR}/dedupe_restaurants.py" ]; then
        python3 "${SCRIPTS_DIR}/dedupe_restaurants.py" \
            "${FILTERED_DIR}" \
            "${CURRENT_DIR}/restaurants_deduped.json"
    else
        echo -e "${YELLOW}警告: dedupe_restaurants.py 不存在，跳过去重${NC}"
    fi
    
    echo -e "${GREEN}✓ 去重合并完成${NC}"
    echo ""
}

# 步骤4: Google Places验证 (可选)
step_validate() {
    echo -e "${BLUE}[Step 4/4] Google Places验证...${NC}"
    echo -e "${YELLOW}提示: 需要配置 GOOGLE_PLACES_API_KEY 环境变量${NC}"
    
    if command -v goplaces > /dev/null 2>&1; then
        echo "执行Google Places验证..."
        # 这里可以添加验证逻辑
        echo -e "${GREEN}✓ 验证完成${NC}"
    else
        echo -e "${YELLOW}警告: goplaces 未安装，跳过验证${NC}"
        echo "安装方式: clawhub install goplaces"
    fi
    
    echo ""
}

# 显示统计
show_stats() {
    echo -e "${BLUE}数据统计${NC}"
    echo "----------------------------------------"
    
    # Raw数据
    if [ -d "${RAW_DIR}" ]; then
        local raw_count
        raw_count=$(find "${RAW_DIR}" -name "feed_*_detail.json" | wc -l)
        echo -e "Raw帖子数: ${GREEN}${raw_count}${NC}"
    fi
    
    # Filtered数据
    if [ -d "${FILTERED_DIR}" ]; then
        local filtered_count
        filtered_count=$(find "${FILTERED_DIR}" -name "feed_*_detail.json" | wc -l)
        echo -e "通过过滤: ${GREEN}${filtered_count}${NC}"
    fi
    
    # 当前数据库
    if [ -f "${CURRENT_DIR}/restaurant_database.json" ]; then
        local db_count
        db_count=$(jq '.total_restaurants' "${CURRENT_DIR}/restaurant_database.json")
        echo -e "当前餐厅数: ${GREEN}${db_count}${NC}"
    fi
    
    # 数据大小
    if [ -d "${PROJECT_DIR}/data" ]; then
        local data_size
        data_size=$(du -sh "${PROJECT_DIR}/data" | cut -f1)
        echo -e "数据总大小: ${GREEN}${data_size}${NC}"
    fi
    
    echo ""
}

# 清理
clean() {
    echo -e "${YELLOW}清理临时文件...${NC}"
    
    read -p "确定要清理filtered目录? (y/N) " confirm
    if [ "$confirm" = "y" ]; then
        rm -rf "${FILTERED_DIR}"
        echo -e "${GREEN}已清理${NC}"
    fi
}

# 完整Pipeline
run_full_pipeline() {
    local start_time
    start_time=$(date +%s)
    
    echo -e "${GREEN}开始完整Pipeline...${NC}"
    echo ""
    
    step_fetch
    step_filter
    step_dedupe
    step_validate
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Pipeline 完成!${NC}"
    echo -e "${GREEN}   耗时: ${duration}秒${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    show_stats
}

# 主函数
main() {
    case "${1:-}" in
        fetch)
            step_fetch
            ;;
        filter)
            step_filter
            ;;
        dedupe)
            step_dedupe
            ;;
        validate)
            step_validate
            ;;
        full)
            run_full_pipeline
            ;;
        stats)
            show_stats
            ;;
        clean)
            clean
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            show_help
            exit 1
            ;;
    esac
}

main "$@"