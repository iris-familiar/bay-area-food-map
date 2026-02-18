#!/bin/bash

# 采集剩余帖子脚本 - macOS兼容版
# 不使用timeout命令

PROJECT_DIR="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map"
DATA_DIR="$PROJECT_DIR/data/raw/v2"
XHS_DIR="/Users/joeli/.agents/skills/xiaohongshu/scripts"
FAILED_LOG="$DATA_DIR/failed_notes.log"
PROGRESS_LOG="$DATA_DIR/collection_progress.log"

# 创建目录
mkdir -p "$DATA_DIR/posts"
mkdir -p "$DATA_DIR/comments"

# 获取待采集的note_ids（排除已完成的）
get_remaining_ids() {
    cd "$PROJECT_DIR"
    
    # 从phase1a_search_results.json提取所有唯一ID
    ALL_IDS=$(cat data/raw/phase1a_search_results.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
ids = [p['id'] for p in data['posts']]
for id in set(ids):
    print(id)
")
    
    # 获取已采集的ID
    COLLECTED_IDS=$(ls -1 data/raw/v2/posts/*.json 2>/dev/null | xargs -I{} basename {} .json || true)
    
    # 找出未采集的ID
    for id in $ALL_IDS; do
        if ! echo "$COLLECTED_IDS" | grep -q "^${id}$"; then
            echo "$id"
        fi
    done | sort -u
}

# 从phase1a_search_results.json获取xsec_token
get_xsec_token() {
    local note_id=$1
    cd "$PROJECT_DIR"
    cat data/raw/phase1a_search_results.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data['posts']:
    if p['id'] == '$note_id':
        print(p.get('xsecToken', ''))
        break
"
}

# 采集单个帖子
collect_post() {
    local note_id=$1
    local xsec_token=$2
    local attempt=$3
    
    echo "[$attempt] 采集帖子: $note_id"
    
    # 使用 feed_id 调用API，捕获输出和错误
    local detail_output
    local exit_code
    
    detail_output=$(cd "$XHS_DIR" && ./mcp-call.sh get_feed_detail "{\"feed_id\": \"$note_id\", \"xsec_token\": \"$xsec_token\"}" 2>&1) &
    local pid=$!
    
    # 等待最多30秒
    local waited=0
    while kill -0 $pid 2>/dev/null; do
        sleep 1
        waited=$((waited + 1))
        if [ $waited -ge 30 ]; then
            kill $pid 2>/dev/null
            echo "  ❌ 超时(30s): $note_id"
            return 1
        fi
    done
    
    wait $pid
    exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo "  ❌ 获取详情失败: $note_id (exit: $exit_code)"
        return 1
    fi
    
    # 检查是否有错误
    if echo "$detail_output" | grep -q '"error"'; then
        echo "  ❌ API返回错误: $note_id"
        echo "$detail_output" | head -3
        return 1
    fi
    
    # 检查输出是否为空
    if [ -z "$detail_output" ] || [ "$detail_output" = "null" ]; then
        echo "  ❌ 空响应: $note_id"
        return 1
    fi
    
    # 保存帖子详情
    echo "$detail_output" > "$DATA_DIR/posts/${note_id}.json"
    
    echo "  ✅ 完成: $note_id"
    return 0
}

# 主采集流程
main() {
    echo "=== 开始采集剩余帖子 ==="
    echo "开始时间: $(date)"
    
    # 获取待采集列表
    REMAINING_IDS=$(get_remaining_ids)
    TOTAL_REMAINING=$(echo "$REMAINING_IDS" | wc -l | tr -d ' ')
    
    echo "待采集数量: $TOTAL_REMAINING"
    
    # 清空失败日志
    > "$FAILED_LOG"
    
    local count=0
    
    echo "$REMAINING_IDS" | while read note_id; do
        [ -z "$note_id" ] && continue
        
        count=$((count + 1))
        echo ""
        echo "[$count/$TOTAL_REMAINING] 处理: $note_id"
        
        # 获取xsec_token
        xsec_token=$(get_xsec_token "$note_id")
        
        if [ -z "$xsec_token" ]; then
            echo "  ⚠️ 未找到xsec_token，跳过"
            echo "$note_id|missing_token" >> "$FAILED_LOG"
            continue
        fi
        
        # 尝试采集（最多2次）
        local collected=false
        for attempt in 1 2; do
            if collect_post "$note_id" "$xsec_token" "$attempt"; then
                collected=true
                break
            fi
            
            if [ $attempt -lt 2 ]; then
                echo "  等待2秒后重试..."
                sleep 2
            fi
        done
        
        if [ "$collected" = false ]; then
            echo "$note_id|failed" >> "$FAILED_LOG"
        fi
        
        # 记录进度
        local current_success=$(ls -1 "$DATA_DIR/posts"/*.json 2>/dev/null | wc -l | tr -d ' ')
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Progress: $count/$TOTAL_REMAINING | Total: $current_success" >> "$PROGRESS_LOG"
        
        # 每10条输出进度
        if [ $((count % 10)) -eq 0 ]; then
            echo ""
            echo "📊 进度: $count/$TOTAL_REMAINING | 当前总帖子数: $current_success"
        fi
        
        # 控制请求频率（每4秒一条）
        sleep 4
    done
    
    echo ""
    echo "=== 采集完成 ==="
    echo "结束时间: $(date)"
    local final_count=$(ls -1 "$DATA_DIR/posts"/*.json 2>/dev/null | wc -l | tr -d ' ')
    echo "最终帖子数: $final_count"
    
    # 生成报告
    generate_report
}

# 生成采集报告
generate_report() {
    local report_file="$DATA_DIR/collection_complete_report.md"
    local total_posts=$(ls -1 "$DATA_DIR/posts"/*.json 2>/dev/null | wc -l | tr -d ' ')
    local failed_count=$(wc -l < "$FAILED_LOG" 2>/dev/null | tr -d ' ' || echo 0)
    
    cat > "$report_file" << EOF
# 数据采集完成报告

生成时间: $(date)

## 采集统计

- 总帖子数: $total_posts / 91 (预期)
- 失败记录数: $failed_count

## 失败记录

$(cat "$FAILED_LOG" 2>/dev/null || echo "无")

## 数据验证清单

- [ ] 所有帖子都有content字段 (desc)
- [ ] 所有帖子都有create_time (time字段)
- [ ] 评论数据完整性
EOF

    echo "报告已生成: $report_file"
}

# 运行
main
