#!/bin/bash
# Auto-generated restore script for cron_test_20260218_161212
# Run this to restore data to pre-test state

cd "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map"
cp -r "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/backup/cron_test_backup_20260218_161212/current"/* "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/" 2>/dev/null || true
cp -r "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/backup/cron_test_backup_20260218_161212/serving"/* "/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/serving/" 2>/dev/null || true
echo "✅ Data restored from /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/backup/cron_test_backup_20260218_161212"
