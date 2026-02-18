#!/bin/bash
# Background script to fetch all post details

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# Process all posts with 3 second delay between each
node scripts/fetch_post_details_v2.js > data/raw/fetch_log.txt 2>&1

echo "Fetch complete at $(date)" >> data/raw/fetch_log.txt
