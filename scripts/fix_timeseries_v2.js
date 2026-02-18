#!/usr/bin/env node
/**
 * 修正时间序列数据映射 - 使用真实帖子日期计算热度变化
 * 
 * 策略：通过餐厅名称匹配帖子内容，将帖子日期正确映射到餐厅
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const DATA_DIR = path.join(WORKSPACE_DIR, 'data');

// 读取文件
const restaurantDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'current/restaurant_database.json'), 'utf8'));
const postSummary = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'raw/post_fetch_summary.json'), 'utf8'));

console.log('📊 开始修正时间序列数据映射...\n');

// Step 1: 构建post_id -> post信息的映射
const postMap = new Map();
for (const post of postSummary.success) {
    const raw = post.raw_data?.data?.note || {};
    const interactInfo = raw.interactInfo || {};
    const desc = raw.desc || '';
    const title = raw.title || '';
    
    postMap.set(post.id, {
        id: post.id,
        date: post.date || (post.publishTime ? post.publishTime.split('T')[0] : null),
        timestamp: post.timestamp,
        title: title,
        desc: desc,
        likedCount: parseInt(interactInfo.likedCount) || 0,
        commentCount: parseInt(interactInfo.commentCount) || 0,
        sharedCount: parseInt(interactInfo.sharedCount) || 0,
        collectedCount: parseInt(interactInfo.collectedCount) || 0
    });
}

console.log(`✅ 已加载 ${postMap.size} 条帖子数据`);

// 统计日期分布
const dateDistribution = new Map();
for (const post of postMap.values()) {
    if (post.date) {
        dateDistribution.set(post.date, (dateDistribution.get(post.date) || 0) + 1);
    }
}
const sortedDates = Array.from(dateDistribution.keys()).sort();
console.log(`📅 帖子日期范围: ${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`);
console.log(`📅 共涉及 ${dateDistribution.size} 个不同日期\n`);

// Step 2: 为每个餐厅匹配相关帖子
// 策略：检查帖子标题和内容是否包含餐厅名称
function matchPostsToRestaurant(restaurant) {
    const matchedPosts = [];
    const nameVariants = [
        restaurant.name,
        restaurant.name_en,
        ...(restaurant.name?.split(/[,，\s]+/) || []), // 分隔名称
        ...(restaurant.name_en?.split(/[,\s]+/) || [])
    ].filter(Boolean);
    
    // 去重并清理
    const uniqueVariants = [...new Set(nameVariants.map(n => n.trim().toLowerCase()))]
        .filter(n => n.length >= 2); // 至少2个字符
    
    for (const post of postMap.values()) {
        const content = (post.title + ' ' + post.desc).toLowerCase();
        
        // 检查是否包含餐厅名称的任何变体
        for (const variant of uniqueVariants) {
            if (content.includes(variant)) {
                matchedPosts.push(post);
                break;
            }
        }
    }
    
    return matchedPosts;
}

// Step 3: 为每个餐厅计算时间序列
let processedCount = 0;
let skippedCount = 0;

for (const restaurant of restaurantDb.restaurants) {
    // 匹配帖子
    const matchedPosts = matchPostsToRestaurant(restaurant);
    
    // 如果没有找到匹配的帖子，跳过
    if (matchedPosts.length === 0) {
        skippedCount++;
        // 初始化空的时间序列
        restaurant.time_series = {
            timeline: [],
            first_mentioned: null,
            peak_discussion_date: null,
            total_engagement: 0,
            trend_7d: 0,
            trend_30d: 0
        };
        continue;
    }
    
    processedCount++;
    
    // Step 4: 按日期聚合engagement
    const dailyEngagement = new Map();
    
    for (const post of matchedPosts) {
        if (!post.date) continue;
        
        // engagement = 点赞 + 评论 + 分享 + 收藏
        const engagement = post.likedCount + post.commentCount + post.sharedCount + post.collectedCount;
        
        if (!dailyEngagement.has(post.date)) {
            dailyEngagement.set(post.date, { date: post.date, engagement: 0, posts: 0 });
        }
        const day = dailyEngagement.get(post.date);
        day.engagement += engagement;
        day.posts += 1;
    }
    
    // Step 5: 构建timeline（按日期排序）
    const timeline = Array.from(dailyEngagement.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Step 6: 计算关键指标
    const totalEngagement = timeline.reduce((sum, day) => sum + day.engagement, 0);
    const firstMentioned = timeline.length > 0 ? timeline[0].date : null;
    
    // 找到engagement最高的日期
    const peakDay = timeline.length > 0 
        ? timeline.reduce((max, day) => day.engagement > max.engagement ? day : max, timeline[0])
        : null;
    const peakDiscussionDate = peakDay ? peakDay.date : null;
    
    // Step 7: 计算真实趋势（基于可用数据的最新日期）
    // 使用数据中最晚的日期作为参考点
    const latestDate = sortedDates[sortedDates.length - 1];
    const referenceDate = new Date(latestDate);
    
    const thirtyDaysAgo = new Date(referenceDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(referenceDate);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const sevenDaysAgo = new Date(referenceDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(referenceDate);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    // 计算7天趋势
    let recent7d = 0, previous7d = 0;
    for (const day of timeline) {
        const dayDate = new Date(day.date);
        if (dayDate >= sevenDaysAgo && dayDate <= referenceDate) {
            recent7d += day.engagement;
        } else if (dayDate >= fourteenDaysAgo && dayDate < sevenDaysAgo) {
            previous7d += day.engagement;
        }
    }
    const trend7d = previous7d > 0 ? ((recent7d - previous7d) / previous7d) * 100 : (recent7d > 0 ? 100 : 0);
    
    // 计算30天趋势
    let recent30d = 0, previous30d = 0;
    for (const day of timeline) {
        const dayDate = new Date(day.date);
        if (dayDate >= thirtyDaysAgo && dayDate <= referenceDate) {
            recent30d += day.engagement;
        } else if (dayDate >= sixtyDaysAgo && dayDate < thirtyDaysAgo) {
            previous30d += day.engagement;
        }
    }
    const trend30d = previous30d > 0 ? ((recent30d - previous30d) / previous30d) * 100 : (recent30d > 0 ? 100 : 0);
    
    // Step 8: 更新餐厅数据
    restaurant.time_series = {
        timeline: timeline,
        first_mentioned: firstMentioned,
        peak_discussion_date: peakDiscussionDate,
        total_engagement: totalEngagement,
        trend_7d: Math.round(trend7d * 10) / 10,
        trend_30d: Math.round(trend30d * 10) / 10
    };
    
    // 同时更新旧的metrics字段以兼容现有UI
    if (!restaurant.metrics) restaurant.metrics = {};
    if (!restaurant.metrics.trend_over_time) restaurant.metrics.trend_over_time = {};
    
    restaurant.metrics.trend_over_time.trend_percentage = restaurant.time_series.trend_7d;
    restaurant.metrics.trend_over_time.trend_direction = restaurant.time_series.trend_7d > 10 ? 'rising' : 
                                                         restaurant.time_series.trend_7d < -10 ? 'declining' : 'stable';
    restaurant.metrics.trend_over_time.peak_discussion_date = peakDiscussionDate;
    restaurant.metrics.trend_over_time.first_mentioned = firstMentioned;
    
    // 打印部分餐厅的时间序列用于验证
    if (processedCount <= 10) {
        console.log(`\n🍴 ${restaurant.name} (匹配 ${matchedPosts.length} 个帖子)`);
        console.log(`   Timeline: ${timeline.slice(0, 5).map(t => `${t.date}(+${t.engagement})`).join(', ')}${timeline.length > 5 ? '...' : ''}`);
        console.log(`   总互动: ${totalEngagement}, 7天趋势: ${trend7d.toFixed(1)}%, 30天趋势: ${trend30d.toFixed(1)}%`);
    }
}

console.log(`\n\n✅ 处理完成:`);
console.log(`   - 成功匹配: ${processedCount} 家餐厅`);
console.log(`   - 未匹配到帖子: ${skippedCount} 家餐厅`);

// Step 9: 保存修正后的数据库
restaurantDb.version = "3.4-timeseries-fixed";
restaurantDb.updated_at = new Date().toISOString().split('T')[0];

// 保存到current目录
fs.writeFileSync(
    path.join(DATA_DIR, 'current/restaurant_database.json'),
    JSON.stringify(restaurantDb, null, 2)
);

// 同时保存到archive作为备份
const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
fs.writeFileSync(
    path.join(DATA_DIR, `archive/restaurant_database_timeseries_fixed_${timestamp}.json`),
    JSON.stringify(restaurantDb, null, 2)
);

console.log(`\n💾 已保存:`);
console.log(`   - data/current/restaurant_database.json`);
console.log(`   - data/archive/restaurant_database_timeseries_fixed_${timestamp}.json`);

// Step 10: 生成验证报告
const report = {
    generated_at: new Date().toISOString(),
    total_restaurants: restaurantDb.restaurants.length,
    processed: processedCount,
    skipped: skippedCount,
    post_date_range: {
        earliest: sortedDates[0],
        latest: sortedDates[sortedDates.length - 1]
    },
    sample_restaurants: restaurantDb.restaurants
        .filter(r => r.time_series && r.time_series.timeline.length > 0)
        .slice(0, 10)
        .map(r => ({
            name: r.name,
            matched_posts: r.time_series.timeline.reduce((sum, t) => sum + t.posts, 0),
            timeline_count: r.time_series.timeline.length,
            total_engagement: r.time_series.total_engagement,
            trend_7d: r.time_series.trend_7d,
            trend_30d: r.time_series.trend_30d,
            first_mentioned: r.time_series.first_mentioned,
            peak_date: r.time_series.peak_discussion_date
        }))
};

fs.writeFileSync(
    path.join(DATA_DIR, 'docs/timeseries_fix_report.json'),
    JSON.stringify(report, null, 2)
);

console.log(`\n📄 验证报告已保存: data/docs/timeseries_fix_report.json`);
console.log('\n✨ 时间序列数据修正完成！');
