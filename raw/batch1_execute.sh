#!/bin/bash
# 第一批搜索执行记录 - Cupertino美食
# 执行时间: 2026-02-15 16:19

SEARCH_TERM="Cupertino美食"
DATE="2026-02-15"

echo "======================================================================"
echo "🎯 第一批搜索执行记录"
echo "======================================================================"
echo "搜索词: $SEARCH_TERM"
echo "执行时间: $(date)"
echo ""

# 搜索得到的高互动帖子 (Top 5)
POSTS=(
    "697c2dcb000000002200ab2d:ABQ17w4QFJ8eY_tqaw2VhdjwFzrcVRmcWtdsz-rodxmNs=  # 湾区Cupertino 日常探店 123赞 7评论"
    "67b7c8f1000000000302bcc1:ABCr4LnpiILCcjBKwST6as0HLszV0RqnFP_T4n3zPiXx4=  # Cupertino Wooja 牛家韩国烤肉 189赞 41评论"
    "67ba7dae00000000290119d8:ABLJjVY3dq_pWmTWDpcQwyk85bsIATjwgUDMMjhNlUA-o=  # 湾区中餐超全推荐 1457赞 72评论"
    "695f421f000000001a022b7e:ABEhzfU2DhEMdBy-qOVqDP1jOWJOnkOYTh-wOAhgJi1C4=  # Cupertino新开川式砂锅 106赞 16评论"
    "692d5aaf000000001b020caa:ABeLXP9gsg0SS-LLWssUWBeyMRodAfap_aNx1uAZgxT-A=  # 重庆荣昌铺盖面 128赞 37评论"
)

echo "📊 获取前5个高互动帖子详情..."
echo ""

for i in "${!POSTS[@]}"; do
    IFS=':' read -r FEED_ID XSEC_TOKEN DESC <<< "${POSTS[$i]}"
    
    echo "[$((i+1))/5] 获取帖子详情: $FEED_ID"
    echo "   描述: $DESC"
    
    # 保存到batch记录
    echo "   保存到: ~/projects/bay-area-food-map/raw/batch1_${FEED_ID}.json"
    
    # 实际执行命令 (需要在xiaohongshu-mcp目录执行)
    # ./scripts/mcp-call.sh get_feed_detail "{\"feed_id\": \"$FEED_ID\", \"xsec_token\": \"$XSEC_TOKEN\", \"load_all_comments\": true}" > ~/projects/bay-area-food-map/raw/batch1_${FEED_ID}.json
    
    # 添加随机延迟 8-12秒
    DELAY=$((8 + RANDOM % 5))
    echo "   延迟: ${DELAY}秒"
    sleep $DELAY
    echo ""
done

echo "======================================================================"
echo "✅ 第一批搜索数据获取完成"
echo "======================================================================"
echo ""
echo "📁 保存位置:"
echo "   ~/projects/bay-area-food-map/raw/batch1_*.json"
echo ""
echo "📝 下一步:"
echo "   1. 确认5个帖子详情已保存"
echo "   2. 运行: python3 scripts/discover_from_comments.py"
echo "   3. 提取新餐厅候选"
echo ""

# 生成执行命令文件
OUTPUT_FILE="$HOME/projects/bay-area-food-map/raw/batch1_execute_commands.sh"
cat > "$OUTPUT_FILE" << 'EOF'
#!/bin/bash
# 执行获取帖子详情的实际命令
# 需要在xiaohongshu skill目录执行

cd ~/.openclaw/skills/xiaohongshu

# Post 1: 湾区Cupertino 日常探店 (123赞, 7评论)
./scripts/mcp-call.sh get_feed_detail '{"feed_id": "697c2dcb000000002200ab2d", "xsec_token": "ABQ17w4QFJ8eY_tqaw2VhdjwFzrcVRmcWtdsz-rodxmNs=", "load_all_comments": true}' > ~/projects/bay-area-food-map/raw/batch1_697c2dcb000000002200ab2d.json
sleep 10

# Post 2: Cupertino Wooja 牛家韩国烤肉 (189赞, 41评论)
./scripts/mcp-call.sh get_feed_detail '{"feed_id": "67b7c8f1000000000302bcc1", "xsec_token": "ABCr4LnpiILCcjBKwST6as0HLszV0RqnFP_T4n3zPiXx4=", "load_all_comments": true}' > ~/projects/bay-area-food-map/raw/batch1_67b7c8f1000000000302bcc1.json
sleep 9

# Post 3: 湾区中餐超全推荐 (1457赞, 72评论)
./scripts/mcp-call.sh get_feed_detail '{"feed_id": "67ba7dae00000000290119d8", "xsec_token": "ABLJjVY3dq_pWmTWDpcQwyk85bsIATjwgUDMMjhNlUA-o=", "load_all_comments": true}' > ~/projects/bay-area-food-map/raw/batch1_67ba7dae00000000290119d8.json
sleep 11

# Post 4: Cupertino新开川式砂锅 (106赞, 16评论)
./scripts/mcp-call.sh get_feed_detail '{"feed_id": "695f421f000000001a022b7e", "xsec_token": "ABEhzfU2DhEMdBy-qOVqDP1jOWJOnkOYTh-wOAhgJi1C4=", "load_all_comments": true}' > ~/projects/bay-area-food-map/raw/batch1_695f421f000000001a022b7e.json
sleep 8

# Post 5: 重庆荣昌铺盖面 (128赞, 37评论)
./scripts/mcp-call.sh get_feed_detail '{"feed_id": "692d5aaf000000001b020caa", "xsec_token": "ABeLXP9gsg0SS-LLWssUWBeyMRodAfap_aNx1uAZgxT-A=", "load_all_comments": true}' > ~/projects/bay-area-food-map/raw/batch1_692d5aaf000000001b020caa.json

echo "✅ 所有帖子详情已获取"
EOF

chmod +x "$OUTPUT_FILE"

echo "🎯 执行脚本已生成: $OUTPUT_FILE"
echo "   运行: bash $OUTPUT_FILE"
echo ""
