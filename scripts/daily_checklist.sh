#!/bin/bash
# Daily Execution Checklist
# Run this script each day to guide through the data collection process

clear
echo "======================================================================"
echo "🗓️  Bay Area Food Map - Daily Execution Guide"
echo "======================================================================"
echo ""
echo "Date: $(date '+%Y-%m-%d %A')"
echo ""

# Check what day of week it is
DOW=$(date +%u)  # 1=Monday, 7=Sunday

# =============================================================================
# PHASE 1: AUTOMATED TASKS (Already running via cron)
# =============================================================================
echo "✅ PHASE 1: Automated Tasks (via cron)"
echo "----------------------------------------------------------------------"
echo "These run automatically:"
echo "  • 09:00 - Check seed bloggers"
echo "  • 10:00 - Mine comments for new restaurants"
echo "  • 20:00 - Generate daily summary"
echo ""
echo "Check logs: tail -f ~/projects/bay-area-food-map/logs/*.log"
echo ""

# =============================================================================
# PHASE 2: MANUAL TASKS (Your turn!)
# =============================================================================
echo "👤 PHASE 2: Manual Tasks (Anti-detection required)"
echo "----------------------------------------------------------------------"
echo ""

# Task 1: Location Search
echo "📍 Task 1: Location-Based Search (11:00 AM)"
echo "   Duration: ~30 minutes"
echo "   Command:"

if [ $DOW -le 3 ]; then
    # Mon-Wed: High priority locations
    LOCATIONS=("Cupertino美食" "Fremont美食" "Milpitas美食")
    echo "   ./scripts/fetch_xiaohongshu_data.sh \"${LOCATIONS[$((DOW-1))]}\""
elif [ $DOW -le 5 ]; then
    # Thu-Fri: Medium priority
    LOCATIONS=("Mountain View美食" "Palo Alto美食")
    echo "   ./scripts/fetch_xiaohongshu_data.sh \"${LOCATIONS[$((DOW-4))]}\""
else
    # Weekend: General
    echo "   ./scripts/fetch_xiaohongshu_data.sh \"南湾美食\""
fi

echo "   ⚠️  Important: 8-12 second delays between requests!"
echo "   ⚠️  Max 5 posts per search query"
echo ""

# Task 2: Deep Track
echo "🔍 Task 2: Deep Restaurant Tracking (2:00 PM)"
echo "   Duration: ~20 minutes"
echo "   Command:"
echo "   python3 scripts/generate_recursive_search.py data/current/restaurant_database.json"
echo "   bash scripts/run_recursive_search_*.sh"
echo "   ⚠️  Remember: All searches include '湾区' prefix"
echo ""

# Task 3: Scenario Search
echo "🎯 Task 3: Scenario-Based Search (4:00 PM)"
echo "   Duration: ~20 minutes"

# Rotate scenarios by day
SCENARIOS=("湾区约会餐厅" "湾区家庭聚餐" "湾区踩雷避雷" "湾区川菜天花板" "湾区一人食" "湾区夜宵" "湾区新店")
TODAY_SCENARIO=${SCENARIOS[$((DOW-1))]}

echo "   Today's scenario: $TODAY_SCENARIO"
echo "   Command:"
echo "   ./scripts/fetch_xiaohongshu_data.sh \"$TODAY_SCENARIO\""
echo ""

# =============================================================================
# PHASE 3: WEEKLY SPECIAL TASKS
# =============================================================================
if [ $DOW -eq 1 ]; then
    echo "📆 MONDAY SPECIAL: Update Blogger List"
    echo "----------------------------------------------------------------------"
    echo "   Task: Discover new high-quality food bloggers"
    echo "   Command: python3 scripts/update_bloggers.py"
    echo ""
elif [ $DOW -eq 3 ]; then
    echo "📆 WEDNESDAY SPECIAL: Rotate Keywords"
    echo "----------------------------------------------------------------------"
    echo "   Task: Update scenario search keywords"
    echo "   Command: python3 scripts/rotate_keywords.py"
    echo ""
elif [ $DOW -eq 5 ]; then
    echo "📆 FRIDAY SPECIAL: Candidate Review (7:00 PM)"
    echo "----------------------------------------------------------------------"
    echo "   Task: Manually verify new restaurant candidates"
    echo "   Steps:"
    echo "   1. Review: cat data/candidates_from_comments.json"
    echo "   2. Verify on Google Maps"
    echo "   3. Add valid ones to database"
    echo "   Command: python3 scripts/verify_candidates.py"
    echo ""
elif [ $DOW -eq 7 ]; then
    echo "📆 SUNDAY SPECIAL: Weekly Report"
    echo "----------------------------------------------------------------------"
    echo "   Task: Generate weekly summary"
    echo "   Command: python3 scripts/weekly_report.py"
    echo ""
fi

# =============================================================================
# DAILY LIMITS CHECK
# =============================================================================
echo "📊 Daily Limits Check"
echo "----------------------------------------------------------------------"

# Check today's stats if available
if [ -f "data/daily_stats.json" ]; then
    POSTS=$(cat data/daily_stats.json | grep -o '"posts_fetched": [0-9]*' | grep -o '[0-9]*')
    RESTAURANTS=$(cat data/daily_stats.json | grep -o '"restaurants_added": [0-9]*' | grep -o '[0-9]*')
    
    echo "   Posts fetched today: ${POSTS:-0}/50"
    echo "   Restaurants added: ${RESTAURANTS:-0}/5"
else
    echo "   Posts fetched today: 0/50"
    echo "   Restaurants added: 0/5"
fi

echo ""
echo "======================================================================"
echo "💡 Tips:"
echo "   • Run manual tasks during 'active hours' (9am-10pm)"
echo "   • If you hit a rate limit, wait 1 hour and retry"
echo "   • Always check logs if something fails"
echo "   • Friday's candidate review is the most important!"
echo "======================================================================"
echo ""

# Optional: Show progress
if [ -f "data/current/restaurant_database.json" ]; then
    COUNT=$(cat data/current/restaurant_database.json | grep -o '"id": "r' | wc -l)
    echo "📈 Current Progress: $COUNT restaurants (Target: 100)"
    echo ""
fi
