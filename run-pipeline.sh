#!/bin/bash
# Data Pipeline Checklist Runner
# Run this when raw data is updated

echo "🔄 Bay Area Food Map - Data Pipeline"
echo "===================================="
echo ""

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

# Step 1: Check if extraction needed
echo "📋 Step 1: EXTRACTION"
echo "  [ ] Check if new posts added to data/raw/v2/posts/"
echo "  [ ] Run: python3 scripts/extract_restaurants.py"
echo "  [ ] Or spawn LLM agent for extraction"
echo "  [ ] Verify: restaurant_database_llm.json created"
echo ""

# Step 2: Process
echo "📋 Step 2: PROCESSING"
python3 scripts/process_restaurants.py
if [ $? -eq 0 ]; then
    echo "  ✅ Processing complete"
else
    echo "  ❌ Processing failed"
    exit 1
fi
echo ""

# Step 3: Generate search mapping
echo "📋 Step 3: SEARCH MAPPING"
node -e "
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/current/restaurant_database_clean.json', 'utf8'));

const scenes = {
  'family-dining': [], 'date-night': [], 'group-dining': [],
  'solo-dining': [], 'lunch-spot': [], 'late-night': [],
  'quick-bite': [], 'celebration': [], 'budget-friendly': [],
  'business-meal': [], 'foodie-adventure': [], 'comfort-food': []
};

const cuisineScenes = {
  '火锅': ['group-dining', 'celebration', 'comfort-food'],
  '烧烤': ['group-dining', 'late-night', 'foodie-adventure'],
  '日料': ['date-night', 'business-meal', 'foodie-adventure'],
  '韩餐': ['group-dining', 'late-night'],
  '川菜': ['group-dining', 'foodie-adventure', 'comfort-food'],
  '湘菜': ['group-dining', 'comfort-food', 'foodie-adventure'],
  '粤菜': ['family-dining', 'business-meal', 'celebration'],
  '面食': ['quick-bite', 'solo-dining', 'lunch-spot'],
  '饺子': ['family-dining', 'comfort-food'],
};

db.restaurants.forEach(r => {
  const cuisine = r.cuisine;
  if (cuisine && cuisineScenes[cuisine]) {
    cuisineScenes[cuisine].forEach(scene => {
      if (scenes[scene]) scenes[scene].push(r.id);
    });
  }
  if (r.total_engagement > 500) scenes['foodie-adventure'].push(r.id);
});

Object.keys(scenes).forEach(scene => {
  scenes[scene] = [...new Set(scenes[scene])];
});

fs.writeFileSync('./data/current/search_mapping.json', JSON.stringify({
  version: '2.0',
  scenes: Object.keys(scenes),
  mappings: scenes
}, null, 2));

console.log('  ✅ Search mapping generated');
"
echo ""

# Step 4: QA
echo "📋 Step 4: QA VALIDATION"
node -e "
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/current/restaurant_database_clean.json', 'utf8'));

console.log('  Data version:', db.version);
console.log('  Total restaurants:', db.total_restaurants);
console.log('  Processing steps:', db.processing_steps?.join(' → '));

// Count checks
const areaCount = {};
const cuisineCount = {};
db.restaurants.forEach(r => {
  areaCount[r.area || 'Unknown'] = (areaCount[r.area || 'Unknown'] || 0) + 1;
  cuisineCount[r.cuisine || 'Unknown'] = (cuisineCount[r.cuisine || 'Unknown'] || 0) + 1;
});

console.log('');
console.log('  Top 5 areas:', Object.entries(areaCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([a,c]) => a + ':' + c).join(', '));
console.log('  Top 5 cuisines:', Object.entries(cuisineCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([c,n]) => c + ':' + n).join(', '));

console.log('');
console.log('  ✅ QA complete');
"
echo ""

# Step 5: Deploy
echo "📋 Step 5: DEPLOYMENT"
cp data/current/restaurant_database_clean.json data/current/restaurant_database.json
cp data/current/restaurant_database_clean.json data/current/restaurant_database_v5_ui.json
echo "  ✅ Copied to UI files"
echo ""

echo "===================================="
echo "✅ Pipeline complete!"
echo ""
echo "Access: http://localhost:8888/?reset"
echo ""
