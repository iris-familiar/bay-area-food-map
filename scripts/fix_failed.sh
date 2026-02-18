#!/bin/bash
# 修复21个失败的帖子

OUTPUT_DIR="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts"

declare -A POSTS_TOKENS
POSTS_TOKENS["66667292000000000f00f266"]="ABepYsThia3Y2-1Y2UZAB7vQjuEjffXumjuICHPHRi6ww="
POSTS_TOKENS["69607392000000000a03362c"]="AB5jdyXT2153KteVkLhHHnYqJaONxjBeJ1ebNXabMQqiU="
POSTS_TOKENS["69267f9c000000001d038a73"]="ABAzcx7LwqBqelwGeabCA951uFPQwfKx77cwQibTv6zVI="
POSTS_TOKENS["68bb9f83000000001b02386a"]="ABjgWXOuq_LOByHnTg809Zo-Pj-T8zFaP2J0jmqtNQYNI="
POSTS_TOKENS["6923764a000000001f00cd7c"]="AB70cetXGsTodsvrY10u4lOlkVN4qkOFpd6yOjUjQ8uHk="
POSTS_TOKENS["694a0149000000001f007d63"]="ABomYfSEDHkJ8duq3nhHvx3aJPSno05tTf06bU2LczCVw="
POSTS_TOKENS["68df433c000000000701726b"]="ABGamp6-7RepfvcUc81xZSfo8DZb4F1u6lAXJ4WBCj1qw="
POSTS_TOKENS["69388a61000000001e038496"]="ABdhoFK-kgpy9uVBxwOYoTAxBCDagW5lXRnVpTKNsTYt8="
POSTS_TOKENS["688bd0f4000000002301b078"]="ABaONeIO_eHXiXLdptZyOKpcXxlEgal5ZAFsd-GBo1LfM="
POSTS_TOKENS["6948d270000000001d03ce8e"]="ABdRUBETnRlTPbhyN4KhejvEvhIu1kOEknV_egTOn0fP8="
POSTS_TOKENS["690b7c6f000000000703b381"]="ABbxwunjbiZoW_yRc0c6jz5EX4HdP5XLXUt_6XkJNteAg="
POSTS_TOKENS["68ddb63200000000040153ba"]="ABYmZsEZ4pNP8sfsbm4zHbhxHUWktaMpRasKAhHrfpHUg="
POSTS_TOKENS["6959bddc000000002203982b"]="ABULjIrdOcRHOp9REs1GyR07xacQfnPOG1CynPZuEpqhg="
POSTS_TOKENS["6928cb59000000001e02569d"]="ABeLQspkoOY0qeHQqKpYZCY0ITm_jf5gTnYQEZlZJD95c="
POSTS_TOKENS["68c1b57f000000001d00c132"]="ABjnz5bRP5vIC_N2TGJopEOgIf4KU_yyo1KKsQnltgax8="
POSTS_TOKENS["690cf26b000000000401123f"]="ABZU90LmBbUa-yxApWVTiCQ8iJWNNl0tr3bStFa2_jtT0="
POSTS_TOKENS["691024250000000003021c19"]="ABj_acke9tTavqbC6A-LrNsEbHDmXNlrfeZyKKlkZZquA="
POSTS_TOKENS["69031ede0000000007000645"]="ABnqgr2EEKfSkID35bdrSAjrbjNwK2Qa7K3IAqWg8Dik4="
POSTS_TOKENS["697d2bcd0000000022023751"]="ABdBLzCC6_3kH5_IUIWNR9CLtJd_sQFOa-4mhhmWROskc="
POSTS_TOKENS["694dc5a3000000002200ba41"]="ABWdaGh86Q6z5up0OLnyN_-RRbz7YgZqw4qjjaOcZkmPs="
POSTS_TOKENS["68872a1f000000002001a8a1"]="ABH6bloeCTamsKQk1jwmeRglffBnLeImRUkISwAAXJltE="

# 找到可用的xiaohongshu-mcp服务器端口
find_mcp_port() {
    # 尝试找到xiaohongshu-mcp进程
    local pid=$(pgrep -f xiaohongshu-mcp | head -1)
    if [ -n "$pid" ]; then
        # 尝试通过lsof获取端口
        port=$(lsof -Pan -p $pid 2>/dev/null | grep LISTEN | awk -F: '{print $2}' | awk '{print $1}' | head -1)
        if [ -n "$port" ]; then
            echo "$port"
            return
        fi
    fi
    echo ""
}

# 检查是否已经修复
is_fixed() {
    local file="$1"
    if [ -f "$file" ]; then
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        if [ "$size" -gt 1000 ]; then
            return 0
        fi
    fi
    return 1
}

# 使用mcp-call.sh脚本获取数据
fetch_with_mcp() {
    local note_id="$1"
    local xsec_token="$2"
    local output_file="$3"
    
    # 尝试使用xiaohongshu skill的mcp-call
    local skill_dir="/Users/joeli/.agents/skills/xiaohongshu"
    if [ -f "$skill_dir/scripts/mcp-call.sh" ]; then
        cd "$skill_dir/scripts"
        ./mcp-call.sh get_feed_detail \
            "{\"feed_id\": \"$note_id\", \"xsec_token\": \"$xsec_token\", \"load_all_comments\": true}" \
            > "$output_file" 2>/dev/null
        
        if [ -f "$output_file" ]; then
            local size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
            if [ "$size" -gt 1000 ]; then
                return 0
            fi
        fi
    fi
    return 1
}

echo "================================"
echo "开始修复21个失败帖子"
echo "================================"

success=0
failed=0
total=0

for note_id in "${!POSTS_TOKENS[@]}"; do
    total=$((total + 1))
    xsec_token="${POSTS_TOKENS[$note_id]}"
    output_file="$OUTPUT_DIR/$note_id.json"
    
    echo ""
    echo "[$total/21] 处理: $note_id"
    
    # 检查是否已经修复
    if is_fixed "$output_file"; then
        echo "  ✓ 已经修复，跳过"
        success=$((success + 1))
        continue
    fi
    
    # 尝试获取数据
    if fetch_with_mcp "$note_id" "$xsec_token" "$output_file"; then
        echo "  ✓ 成功修复"
        success=$((success + 1))
    else
        echo "  ✗ 修复失败"
        failed=$((failed + 1))
    fi
    
    # 延迟避免请求过快
    sleep 0.5
done

echo ""
echo "================================"
echo "修复完成!"
echo "  成功: $success"
echo "  失败: $failed"
echo "================================"
