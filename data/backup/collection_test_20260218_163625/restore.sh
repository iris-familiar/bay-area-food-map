#!/bin/bash
cd "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map"
cp "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/backup/collection_test_20260218_163625/restaurant_database.json" data/current/
cp "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/backup/collection_test_20260218_163625/serving_data.json" data/serving/ 2>/dev/null || true
echo "✅ 数据已恢复"
