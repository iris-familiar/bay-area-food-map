#!/usr/bin/env node
/**
 * 时间序列数据更新助手
 * 供cron job调用，用于：
 * 1. 创建每日数据文件
 * 2. 更新餐厅时间序列数据
 * 3. 计算趋势指标
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const LOG_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/logs';

// Ensure directories exist
[DAILY_DIR, LOG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const TODAY = new Date().toISOString().split('T')[0];
const TODAY_DATETIME = new Date().toISOString();

// Command line args
const command = process.argv[2];

switch (command) {
    case 'init-daily':
        initDailyFile();
        break;
    case 'update-timeseries':
        updateTimeSeries();
        break;
    case 'calculate-trends':
        calculateTrends();
        break;
    case 'summary':
        printSummary();
        break;
    default:
        console.log(`
Usage: node timeseries-helper.js [command]

Commands:
  init-daily        - 创建今日数据文件模板
  update-timeseries - 更新餐厅时间序列数据
  calculate-trends  - 计算趋势指标
  summary           - 打印时间序列数据摘要
        `);
}

// 创建今日数据文件模板
function initDailyFile() {
    const filePath = path.join(DAILY_DIR, `${TODAY}.json`);
    
    if (fs.existsSync(filePath)) {
        console.log(`✅ Daily file already exists: ${filePath}`);
        return;
    }
    
    const template = {
        date: TODAY,
        scraped_at: TODAY_DATETIME,
        posts: [],
        restaurant_mentions: {},
        daily_metrics: {
            total_posts: 0,
            total_engagement: 0,
            restaurants_covered: []
        }
    };
    
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
    console.log(`✅ Created daily file: ${filePath}`);
}

// 更新餐厅时间序列数据
function updateTimeSeries() {
    const dbPath = path.join(DATA_DIR, 'current/restaurant_database_timeseries.json');
    const dailyFile = path.join(DAILY_DIR, `${TODAY}.json`);
    
    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found:', dbPath);
        process.exit(1);
    }
    
    if (!fs.existsSync(dailyFile)) {
        console.error('❌ Daily file not found:', dailyFile);
        process.exit(1);
    }
    
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const daily = JSON.parse(fs.readFileSync(dailyFile, 'utf8'));
    
    let updatedCount = 0;
    
    for (const restaurant of db.restaurants) {
        const mentions = daily.restaurant_mentions[restaurant.name] || 0;
        if (mentions === 0) continue;
        
        // Ensure time_series exists
        if (!restaurant.time_series) {
            restaurant.time_series = {
                first_mentioned: TODAY,
                peak_discussion_date: null,
                last_updated: TODAY,
                daily_metrics: [],
                total_posts_tracked: 0,
                post_references: []
            };
        }
        
        // Check if today's entry already exists
        const existingIndex = restaurant.time_series.daily_metrics.findIndex(
            d => d.date === TODAY
        );
        
        const dailyEntry = {
            date: TODAY,
            posts: mentions,
            engagement: daily.daily_metrics.total_engagement,
            sentiment: restaurant.metrics?.sentiment_analysis?.score || 0.75
        };
        
        if (existingIndex >= 0) {
            restaurant.time_series.daily_metrics[existingIndex] = dailyEntry;
        } else {
            restaurant.time_series.daily_metrics.push(dailyEntry);
            restaurant.time_series.total_posts_tracked += mentions;
        }
        
        // Update last_updated
        restaurant.time_series.last_updated = TODAY;
        
        // Recalculate peak date
        const peak = restaurant.time_series.daily_metrics.reduce((max, d) => 
            d.posts > max.posts ? d : max, 
            restaurant.time_series.daily_metrics[0]
        );
        restaurant.time_series.peak_discussion_date = peak?.date || null;
        
        updatedCount++;
    }
    
    // Save updated database
    db.updated_at = TODAY;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    
    // Also save to archive
    const archivePath = path.join(DATA_DIR, `archive/restaurant_database_${TODAY.replace(/-/g, '')}.json`);
    fs.writeFileSync(archivePath, JSON.stringify(db, null, 2));
    
    console.log(`✅ Updated ${updatedCount} restaurants`);
    console.log(`💾 Database saved`);
    console.log(`💾 Archive saved: ${archivePath}`);
}

// 计算趋势指标
function calculateTrends() {
    const dbPath = path.join(DATA_DIR, 'current/restaurant_database_timeseries.json');
    
    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found:', dbPath);
        process.exit(1);
    }
    
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    for (const restaurant of db.restaurants) {
        if (!restaurant.time_series?.daily_metrics?.length) continue;
        
        const metrics = restaurant.time_series.daily_metrics;
        
        // Calculate 7-day trend
        const last7 = metrics.slice(-7);
        const prev7 = metrics.slice(-14, -7);
        
        const last7Avg = last7.reduce((sum, d) => sum + d.posts, 0) / (last7.length || 1);
        const prev7Avg = prev7.reduce((sum, d) => sum + d.posts, 0) / (prev7.length || 1);
        
        const trend7d = prev7Avg > 0 ? ((last7Avg - prev7Avg) / prev7Avg) * 100 : 0;
        
        // Update metrics
        restaurant.metrics = restaurant.metrics || {};
        restaurant.metrics.trend_over_time = {
            trend_direction: trend7d > 5 ? 'up' : trend7d < -5 ? 'down' : 'stable',
            trend_percentage: Math.round(trend7d),
            peak_discussion_date: restaurant.time_series.peak_discussion_date,
            first_mentioned: restaurant.time_series.first_mentioned
        };
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log('✅ Trends calculated for all restaurants');
}

// 打印时间序列数据摘要
function printSummary() {
    const dbPath = path.join(DATA_DIR, 'current/restaurant_database_timeseries.json');
    
    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found:', dbPath);
        process.exit(1);
    }
    
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    // Count restaurants with time_series data
    const withTimeSeries = db.restaurants.filter(r => r.time_series?.daily_metrics?.length > 0);
    
    // Calculate total daily records
    const totalDailyRecords = db.restaurants.reduce((sum, r) => 
        sum + (r.time_series?.daily_metrics?.length || 0), 0
    );
    
    // Find date range
    let minDate = null, maxDate = null;
    for (const r of db.restaurants) {
        if (r.time_series?.daily_metrics) {
            for (const d of r.time_series.daily_metrics) {
                if (!minDate || d.date < minDate) minDate = d.date;
                if (!maxDate || d.date > maxDate) maxDate = d.date;
            }
        }
    }
    
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║        时间序列数据摘要                                 ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║ 总餐厅数: ${String(db.restaurants.length).padEnd(42)}║`);
    console.log(`║ 有时间序列数据: ${String(withTimeSeries.length).padEnd(36)}║`);
    console.log(`║ 总日记录数: ${String(totalDailyRecords).padEnd(40)}║`);
    console.log(`║ 数据范围: ${String(`${minDate || 'N/A'} ~ ${maxDate || 'N/A'}`).padEnd(40)}║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    
    // Top 5 trending restaurants
    console.log('\n📈 趋势TOP 5:');
    const sorted = [...db.restaurants]
        .filter(r => r.metrics?.trend_over_time?.trend_percentage !== undefined)
        .sort((a, b) => 
            (b.metrics.trend_over_time?.trend_percentage || 0) - 
            (a.metrics.trend_over_time?.trend_percentage || 0)
        )
        .slice(0, 5);
    
    sorted.forEach((r, i) => {
        const trend = r.metrics.trend_over_time;
        console.log(`  ${i+1}. ${r.name} (${trend.trend_percentage > 0 ? '+' : ''}${trend.trend_percentage}%)`);
    });
}
