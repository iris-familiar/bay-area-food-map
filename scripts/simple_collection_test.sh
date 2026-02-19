#!/bin/bash
# 简化版数据收集测试
set -e

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

echo "=== 数据收集测试 ==="
echo ""

# 记录原始状态
echo "【1】原始状态"
BEFORE=$(node -e "console.log(require('./data/current/restaurant_database.json').restaurants.length)")
echo "  当前餐厅数: $BEFORE"

# 创建备份
echo ""
echo "【2】创建备份"
BACKUP="data/backup/test_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP"
cp data/current/restaurant_database.json "$BACKUP/"
cp data/serving/serving_data.json "$BACKUP/" 2>/dev/null || true
echo "✅ 备份创建: $BACKUP"

# 添加新餐厅
echo ""
echo "【3】添加新餐厅"
node > /tmp/add_restaurant.js <> 'ENDSCRIPT'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/current/restaurant_database.json', 'utf8'));

const newRestaurant = {
    id: 'test_' + Date.now(),
    name: '🆕 测试新餐厅 ' + new Date().toLocaleTimeString('zh-CN'),
    cuisine: '测试菜系',
    city: 'Fremont',
    region: 'East Bay',
    address: '999 Test Ave, Fremont, CA',
    engagement: 9999,
    sentiment_score: 0.95,
    google_rating: 4.9,
    recommendations: ['招牌测试菜', '测试特色'],
    post_details: [{
        note_id: 'test_note_' + Date.now(),
        title: '新餐厅推荐！',
        engagement: 9999,
        published_at: new Date().toISOString()
    }],
    updated_at: new Date().toISOString()
};

data.restaurants.push(newRestaurant);
data.total_count = data.restaurants.length;

fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(data, null, 2));
console.log('✅ 已添加:', newRestaurant.name);
console.log('✅ 新总数:', data.restaurants.length);
ENDSCRIPT

node /tmp/add_restaurant.js

# 更新Serving层
echo ""
echo "【4】更新Serving层"
cp data/current/restaurant_database.json data/serving/serving_data.json
echo "✅ Serving层已更新"

# 验证
echo ""
echo "【5】验证"
AFTER=$(node -e "console.log(require('./data/current/restaurant_database.json').restaurants.length)")
SERVING=$(node -e "console.log(require('./data/serving/serving_data.json').restaurants.length)")
echo "  Current层: $AFTER 家"
echo "  Serving层: $SERVING 家"

if [ "$AFTER" -eq "$SERVING" ] && [ "$AFTER" -gt "$BEFORE" ]; then
    echo "✅ 验证通过！"
    echo ""
    echo "【结果】"
    echo "  新增餐厅: $((AFTER - BEFORE)) 家"
    echo "  最终总数: $AFTER 家"
    
    # 显示新餐厅
    NEW_NAME=$(node -e "const d=require('./data/current/restaurant_database.json'); const r=d.restaurants.find(x=>x.id.startsWith('test_')); console.log(r?r.name:'未找到')")
    echo "  新餐厅名: $NEW_NAME"
    echo ""
    echo "✅ 数据收集测试成功！"
else
    echo "❌ 验证失败"
    exit 1
fi
