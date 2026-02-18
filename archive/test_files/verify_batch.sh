#!/bin/bash
# 批量 Google Places 验证

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

echo "🔍 批量 Google Places 验证"
echo "============================================================"

# 读取餐厅列表并验证
node -e "
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/current/restaurant_database.json', 'utf8'));

// 输出待验证的餐厅
const restaurants = db.restaurants.slice(0, 20); // 先验证前20家
restaurants.forEach((r, i) => {
  const city = r.area || 'Bay Area';
  console.log(r.name + '|' + city);
});
" | while IFS='|' read -r name city; do
  echo ""
  echo "验证: $name ($city)"
  
  # 调用 goplaces
  result=$(goplaces search "$name $city, CA" --limit 1 --json 2>/dev/null)
  
  if [ -n "$result" ] && [ "$result" != "[]" ]; then
    # 解析结果
    place_name=$(echo "$result" | grep '"name":' | head -1 | sed 's/.*"name": "\([^"]*\)".*/\1/')
    rating=$(echo "$result" | grep '"rating":' | head -1 | sed 's/.*"rating": \([0-9.]*\).*/\1/')
    place_id=$(echo "$result" | grep '"place_id":' | head -1 | sed 's/.*"place_id": "\([^"]*\)".*/\1/')
    
    echo "  ✅ 找到: $place_name"
    echo "     评分: $rating"
    echo "     Place ID: $place_id"
  else
    echo "  ❌ 未找到"
  fi
  
  sleep 1
done
