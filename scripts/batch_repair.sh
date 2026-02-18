#!/bin/bash
# 批量修复剩余的20个失败帖子

cd /Users/joeli/.agents/skills/xiaohongshu/scripts

repair_post() {
    local note_id="$1"
    local xsec_token="$2"
    local output_file="/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts/${note_id}.json"
    
    echo "修复: $note_id"
    ./mcp-call.sh get_feed_detail \
        "{\"feed_id\": \"$note_id\", \"xsec_token\": \"$xsec_token\", \"load_all_comments\": true}" \
        > "$output_file" 2>/dev/null
    
    # 检查结果
    if [ -f "$output_file" ]; then
        local size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
        if [ "$size" -gt 1000 ]; then
            echo "  ✓ 成功 ($size bytes)"
            return 0
        else
            echo "  ✗ 失败 ($size bytes)"
            return 1
        fi
    fi
    echo "  ✗ 文件不存在"
    return 1
}

# 剩余20个帖子（第一个已经修复）
echo "开始批量修复..."
echo ""

repair_post "69607392000000000a03362c" "AB5jdyXT2153KteVkLhHHnYqJaONxjBeJ1ebNXabMQqiU="
sleep 1
repair_post "69267f9c000000001d038a73" "ABAzcx7LwqBqelwGeabCA951uFPQwfKx77cwQibTv6zVI="
sleep 1
repair_post "68bb9f83000000001b02386a" "ABjgWXOuq_LOByHnTg809Zo-Pj-T8zFaP2J0jmqtNQYNI="
sleep 1
repair_post "6923764a000000001f00cd7c" "AB70cetXGsTodsvrY10u4lOlkVN4qkOFpd6yOjUjQ8uHk="
sleep 1
repair_post "694a0149000000001f007d63" "ABomYfSEDHkJ8duq3nhHvx3aJPSno05tTf06bU2LczCVw="
sleep 1
repair_post "68df433c000000000701726b" "ABGamp6-7RepfvcUc81xZSfo8DZb4F1u6lAXJ4WBCj1qw="
sleep 1
repair_post "69388a61000000001e038496" "ABdhoFK-kgpy9uVBxwOYoTAxBCDagW5lXRnVpTKNsTYt8="
sleep 1
repair_post "688bd0f4000000002301b078" "ABaONeIO_eHXiXLdptZyOKpcXxlEgal5ZAFsd-GBo1LfM="
sleep 1
repair_post "6948d270000000001d03ce8e" "ABdRUBETnRlTPbhyN4KhejvEvhIu1kOEknV_egTOn0fP8="
sleep 1
repair_post "690b7c6f000000000703b381" "ABbxwunjbiZoW_yRc0c6jz5EX4HdP5XLXUt_6XkJNteAg="
sleep 1
repair_post "68ddb63200000000040153ba" "ABYmZsEZ4pNP8sfsbm4zHbhxHUWktaMpRasKAhHrfpHUg="
sleep 1
repair_post "6959bddc000000002203982b" "ABULjIrdOcRHOp9REs1GyR07xacQfnPOG1CynPZuEpqhg="
sleep 1
repair_post "6928cb59000000001e02569d" "ABeLQspkoOY0qeHQqKpYZCY0ITm_jf5gTnYQEZlZJD95c="
sleep 1
repair_post "68c1b57f000000001d00c132" "ABjnz5bRP5vIC_N2TGJopEOgIf4KU_yyo1KKsQnltgax8="
sleep 1
repair_post "690cf26b000000000401123f" "ABZU90LmBbUa-yxApWVTiCQ8iJWNNl0tr3bStFa2_jtT0="
sleep 1
repair_post "691024250000000003021c19" "ABj_acke9tTavqbC6A-LrNsEbHDmXNlrfeZyKKlkZZquA="
sleep 1
repair_post "69031ede0000000007000645" "ABnqgr2EEKfSkID35bdrSAjrbjNwK2Qa7K3IAqWg8Dik4="
sleep 1
repair_post "697d2bcd0000000022023751" "ABdBLzCC6_3kH5_IUIWNR9CLtJd_sQFOa-4mhhmWROskc="
sleep 1
repair_post "694dc5a3000000002200ba41" "ABWdaGh86Q6z5up0OLnyN_-RRbz7YgZqw4qjjaOcZkmPs="
sleep 1
repair_post "68872a1f000000002001a8a1" "ABH6bloeCTamsKQk1jwmeRglffBnLeImRUkISwAAXJltE="

echo ""
echo "修复完成！"
