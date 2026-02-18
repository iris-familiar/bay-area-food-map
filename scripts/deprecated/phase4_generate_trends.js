#!/usr/bin/env node
/**
 * Phase 4: Generate trend data based on publish times
 * Calculate first_mentioned, peak_discussion_date, and trend_percentage
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const POST_DETAILS_DIR = path.join(DATA_DIR, 'raw/post_details');
const PHASE1_DATA_PATH = path.join(DATA_DIR, 'raw/phase1a_search_results.json');
const DB_PATH = path.join(DATA_DIR, 'current/restaurant_database_timeseries.json');

// Load data
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const phase1Data = JSON.parse(fs.readFileSync(PHASE1_DATA_PATH, 'utf8'));

// Load all post details
const postDetails = {};
const fetchedFiles = fs.readdirSync(POST_DETAILS_DIR).filter(f => f.endsWith('.json'));
for (const file of fetchedFiles) {
    const id = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(POST_DETAILS_DIR, file), 'utf8'));
    postDetails[id] = data;
}

console.log('📊 Phase 4: 趋势数据生成');
console.log('════════════════════════════════════════════════════════════');
console.log(`已获取发布时间的帖子: ${fetchedFiles.length}/${phase1Data.posts.length}`);

// Build date mapping
const postDateMap = {};
for (const [id, data] of Object.entries(postDetails)) {
    if (data.success && data.date) {
        postDateMap[id] = data.date;
    }
}

console.log(`成功提取日期: ${Object.keys(postDateMap).length}`);

// Analyze posts per date
const dateCounts = {};
for (const date of Object.values(postDateMap)) {
    dateCounts[date] = (dateCounts[date] || 0) + 1;
}

const sortedDates = Object.keys(dateCounts).sort();
console.log(`\n📅 帖子时间分布:`);
sortedDates.forEach(date => {
    console.log(`  ${date}: ${dateCounts[date]} 帖子`);
});

// Calculate date-based trends for each restaurant
let updatedCount = 0;

for (const restaurant of db.restaurants) {
    // Find posts mentioning this restaurant
    const restaurantDates = [];
    
    for (const post of phase1Data.posts) {
        const postDate = postDateMap[post.id];
        if (!postDate) continue;
        
        // Check mentions
        const searchText = (post.title + ' ' + (post.restaurant_candidates?.join(' ') || '')).toLowerCase();
        const restaurantName = restaurant.name.toLowerCase();
        
        if (searchText.includes(restaurantName)) {
            restaurantDates.push(postDate);
        }
    }
    
    if (restaurantDates.length === 0) continue;
    
    // Sort dates
    restaurantDates.sort();
    
    // Calculate metrics
    const firstMentioned = restaurantDates[0];
    const lastMentioned = restaurantDates[restaurantDates.length - 1];
    
    // Calculate peak date (date with most mentions)
    const dateFreq = {};
    for (const date of restaurantDates) {
        dateFreq[date] = (dateFreq[date] || 0) + 1;
    }
    
    let peakDate = firstMentioned;
    let maxFreq = 0;
    for (const [date, count] of Object.entries(dateFreq)) {
        if (count > maxFreq) {
            maxFreq = count;
            peakDate = date;
        }
    }
    
    // Calculate trend percentage based on date distribution
    // More recent = higher trend
    const first = new Date(firstMentioned);
    const last = new Date(lastMentioned);
    const now = new Date();
    
    const totalSpan = (last - first) / (1000 * 60 * 60 * 24); // days
    const daysSinceFirst = (now - first) / (1000 * 60 * 60 * 24);
    const daysSinceLast = (now - last) / (1000 * 60 * 60 * 24);
    
    // Trend calculation: (1 - days_since_last/max_span) * 100
    let trendPercentage = 0;
    if (totalSpan > 0) {
        const recency = 1 - (daysSinceLast / (daysSinceFirst + 30));
        trendPercentage = Math.round(recency * 100);
    } else if (daysSinceLast < 30) {
        trendPercentage = 80; // Recent single mention
    }
    
    // Ensure bounds
    trendPercentage = Math.max(-100, Math.min(100, trendPercentage));
    
    // Determine trend direction
    let trendDirection = 'stable';
    if (trendPercentage > 10) trendDirection = 'up';
    else if (trendPercentage < -10) trendDirection = 'down';
    
    // Update restaurant data
    if (!restaurant.time_series) {
        restaurant.time_series = {
            first_mentioned: firstMentioned,
            peak_discussion_date: peakDate,
            last_updated: new Date().toISOString().split('T')[0],
            daily_metrics: [],
            total_posts_tracked: restaurantDates.length,
            post_references: []
        };
    }
    
    // Update time_series
    restaurant.time_series.first_mentioned = firstMentioned;
    restaurant.time_series.peak_discussion_date = peakDate;
    restaurant.time_series.last_updated = new Date().toISOString().split('T')[0];
    
    // Add daily metrics entries
    for (const [date, count] of Object.entries(dateFreq)) {
        const existing = restaurant.time_series.daily_metrics.find(d => d.date === date);
        if (!existing) {
            restaurant.time_series.daily_metrics.push({
                date,
                posts: count,
                engagement: 0,
                sentiment: restaurant.metrics?.sentiment_analysis?.score || 0.75
            });
        }
    }
    
    // Sort daily metrics
    restaurant.time_series.daily_metrics.sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    
    // Update metrics
    restaurant.metrics = restaurant.metrics || {};
    restaurant.metrics.trend_over_time = {
        trend_direction: trendDirection,
        trend_percentage: trendPercentage,
        peak_discussion_date: peakDate,
        first_mentioned: firstMentioned,
        last_mentioned: lastMentioned
    };
    
    updatedCount++;
}

// Save updated database
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log(`\n✅ 更新了 ${updatedCount} 家餐厅的趋势数据`);

// Print summary
console.log('\n📈 趋势数据示例（前5家）:');
db.restaurants.slice(0, 5).forEach(r => {
    if (r.metrics?.trend_over_time) {
        const t = r.metrics.trend_over_time;
        console.log(`  ${r.name}:`);
        console.log(`    首次提及: ${t.first_mentioned || 'N/A'}`);
        console.log(`    讨论高峰: ${t.peak_discussion_date || 'N/A'}`);
        console.log(`    趋势: ${t.trend_direction} (${t.trend_percentage}%)`);
    }
});

console.log('\n💾 数据库已保存');
