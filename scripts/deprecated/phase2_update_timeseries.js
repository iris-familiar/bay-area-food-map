#!/usr/bin/env node
/**
 * Phase 2: Update restaurant database with time series structure
 * 
 * 1. Add time_series field to each restaurant
 * 2. Calculate first_mentioned from existing metrics
 * 3. Create daily_metrics structure
 * 4. Generate trend data
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const RESTAURANT_DB_PATH = path.join(DATA_DIR, 'current/restaurant_database.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'current/restaurant_database_timeseries.json');
const PHASE1_DATA_PATH = path.join(DATA_DIR, 'raw/phase1a_search_results.json');
const POST_DETAILS_DIR = path.join(DATA_DIR, 'raw/post_details');

// Load existing database
const db = JSON.parse(fs.readFileSync(RESTAURANT_DB_PATH, 'utf8'));
const phase1Data = JSON.parse(fs.readFileSync(PHASE1_DATA_PATH, 'utf8'));

// Load all post details that have been fetched
const postDetails = {};
if (fs.existsSync(POST_DETAILS_DIR)) {
    const files = fs.readdirSync(POST_DETAILS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const id = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(POST_DETAILS_DIR, file), 'utf8'));
        postDetails[id] = data;
    }
}

console.log(`📊 Loaded ${Object.keys(postDetails).length} post details`);
console.log(`🏪 Processing ${db.restaurants.length} restaurants`);

// Create a mapping of post_id to date
const postDateMap = {};
for (const [id, data] of Object.entries(postDetails)) {
    if (data.success && data.date) {
        postDateMap[id] = data.date;
    }
}

// Aggregate posts by date for daily metrics
const dailyMetricsMap = {};
for (const post of phase1Data.posts) {
    const date = postDateMap[post.id];
    if (date) {
        if (!dailyMetricsMap[date]) {
            dailyMetricsMap[date] = {
                date,
                posts: 0,
                engagement: 0,
                post_ids: []
            };
        }
        dailyMetricsMap[date].posts++;
        const engagement = parseInt(post.likedCount || 0) + 
                          parseInt(post.sharedCount || 0) + 
                          parseInt(post.commentCount || 0) + 
                          parseInt(post.collectedCount || 0);
        dailyMetricsMap[date].engagement += engagement;
        dailyMetricsMap[date].post_ids.push(post.id);
    }
}

// Convert to sorted array
const dailyMetrics = Object.values(dailyMetricsMap)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

// Calculate global stats
const allDates = dailyMetrics.map(d => d.date);
const firstMentionedGlobal = allDates.length > 0 ? allDates[0] : null;
const lastMentionedGlobal = allDates.length > 0 ? allDates[allDates[allDates.length - 1]] : null;

console.log(`📅 Date range: ${firstMentionedGlobal} to ${lastMentionedGlobal}`);
console.log(`📈 Total daily records: ${dailyMetrics.length}`);

// Process each restaurant
const updatedRestaurants = db.restaurants.map((restaurant, idx) => {
    // Get existing trend data or create default
    const existingTrend = restaurant.metrics?.trend_over_time || {};
    
    // Find posts that mention this restaurant
    const restaurantDates = [];
    const restaurantPostIds = [];
    
    // Search in phase1a posts for mentions
    for (const post of phase1Data.posts) {
        const postDate = postDateMap[post.id];
        if (!postDate) continue;
        
        // Check if post title or candidates mention this restaurant
        const searchText = (post.title + ' ' + (post.restaurant_candidates?.join(' ') || '')).toLowerCase();
        const restaurantName = restaurant.name.toLowerCase();
        const restaurantNameEn = (restaurant.name_en || '').toLowerCase();
        
        if (searchText.includes(restaurantName) || 
            (restaurantNameEn && searchText.includes(restaurantNameEn))) {
            restaurantDates.push(postDate);
            restaurantPostIds.push(post.id);
        }
    }
    
    // Calculate time series metrics
    const sortedDates = [...new Set(restaurantDates)].sort();
    const firstMentioned = sortedDates.length > 0 ? sortedDates[0] : existingTrend.first_mentioned || '2024-01-01';
    const peakDate = calculatePeakDate(restaurantDates, dailyMetricsMap);
    
    // Calculate trend percentage based on date distribution
    const trendPercentage = calculateTrendPercentage(sortedDates);
    
    // Build daily metrics for this restaurant
    const restaurantDailyMetrics = [];
    const dateEngagement = {};
    
    for (const postId of restaurantPostIds) {
        const post = phase1Data.posts.find(p => p.id === postId);
        const date = postDateMap[postId];
        if (post && date) {
            if (!dateEngagement[date]) {
                dateEngagement[date] = { posts: 0, engagement: 0 };
            }
            dateEngagement[date].posts++;
            dateEngagement[date].engagement += 
                parseInt(post.likedCount || 0) + 
                parseInt(post.sharedCount || 0) + 
                parseInt(post.commentCount || 0) + 
                parseInt(post.collectedCount || 0);
        }
    }
    
    for (const [date, data] of Object.entries(dateEngagement)) {
        restaurantDailyMetrics.push({
            date,
            posts: data.posts,
            engagement: data.engagement,
            sentiment: restaurant.metrics?.sentiment_analysis?.score || 0.75
        });
    }
    
    restaurantDailyMetrics.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Create time_series structure
    const timeSeries = {
        first_mentioned: firstMentioned,
        peak_discussion_date: peakDate,
        last_updated: new Date().toISOString().split('T')[0],
        daily_metrics: restaurantDailyMetrics,
        total_posts_tracked: restaurantPostIds.length,
        post_references: restaurantPostIds
    };
    
    // Update the restaurant object
    return {
        ...restaurant,
        time_series: timeSeries,
        metrics: {
            ...restaurant.metrics,
            trend_over_time: {
                trend_direction: trendPercentage > 0.1 ? 'up' : trendPercentage < -0.1 ? 'down' : 'stable',
                trend_percentage: Math.round(trendPercentage * 100),
                peak_discussion_date: peakDate,
                first_mentioned: firstMentioned
            }
        }
    };
});

console.log('\n✅ Processed all restaurants');

// Create updated database
const updatedDb = {
    ...db,
    version: db.version + '-timeseries',
    updated_at: new Date().toISOString().split('T')[0],
    time_series_meta: {
        daily_metrics_global: dailyMetrics,
        posts_with_dates: Object.keys(postDateMap).length,
        total_posts: phase1Data.posts.length,
        coverage_percentage: Math.round((Object.keys(postDateMap).length / phase1Data.posts.length) * 100)
    },
    restaurants: updatedRestaurants
};

// Save updated database
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updatedDb, null, 2));
console.log(`\n💾 Saved updated database to: ${OUTPUT_PATH}`);

// Also create backup and update current
const backupPath = path.join(DATA_DIR, `archive/restaurant_database_timeseries_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);
fs.writeFileSync(backupPath, JSON.stringify(updatedDb, null, 2));
console.log(`💾 Backup saved to: ${backupPath}`);

// Print summary
console.log('\n' + '═'.repeat(60));
console.log('📊 TIME SERIES SUMMARY');
console.log('═'.repeat(60));
console.log(`Total restaurants: ${updatedRestaurants.length}`);
console.log(`Posts with dates: ${Object.keys(postDateMap).length}/${phase1Data.posts.length} (${updatedDb.time_series_meta.coverage_percentage}%)`);
console.log(`Date range: ${firstMentionedGlobal} to ${lastMentionedGlobal}`);
console.log(`Daily metrics records: ${dailyMetrics.length}`);

// Helper functions
function calculatePeakDate(dates, dailyMap) {
    if (dates.length === 0) return null;
    
    const counts = {};
    for (const date of dates) {
        counts[date] = (counts[date] || 0) + 1;
    }
    
    let maxCount = 0;
    let peakDate = dates[0];
    for (const [date, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            peakDate = date;
        }
    }
    return peakDate;
}

function calculateTrendPercentage(dates) {
    if (dates.length < 2) return 0;
    
    // Sort dates
    const sorted = [...dates].sort();
    const first = new Date(sorted[0]);
    const last = new Date(sorted[sorted.length - 1]);
    const daysDiff = (last - first) / (1000 * 60 * 60 * 24);
    
    if (daysDiff === 0) return 0;
    
    // Simple trend: more recent posts vs older posts
    const mid = new Date((first.getTime() + last.getTime()) / 2);
    let recent = 0, older = 0;
    
    for (const dateStr of sorted) {
        const date = new Date(dateStr);
        if (date >= mid) recent++;
        else older++;
    }
    
    if (older === 0) return recent > 0 ? 1 : 0;
    return (recent - older) / older;
}
