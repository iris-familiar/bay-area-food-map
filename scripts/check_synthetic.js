#!/usr/bin/env node
/**
 * 数据清理脚本 - Phase 1: 识别瞎编数据
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = 'data/current/restaurant_database.json';
const POST_DETAILS_DIR = 'data/raw/post_details';

function loadDatabase() {
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(content);
}

function loadPostDetails(noteId) {
    const filePath = path.join(POST_DETAILS_DIR, `${noteId}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

function checkSyntheticData(restaurant) {
    const issues = [];
    const ts = restaurant.time_series;
    
    if (!ts) {
        return { hasIssues: false, issues: [] };
    }
    
    // 检查1: data_source为"synthetic"
    if (ts.data_source === 'synthetic') {
        issues.push('data_source: synthetic');
    }
    
    // 检查2: timeline均匀分布（可能是瞎编的）
    if (ts.timeline && ts.timeline.length > 2) {
        const dates = ts.timeline.map(t => new Date(t.date).getTime()).sort((a, b) => a - b);
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
            intervals.push(dates[i] - dates[i-1]);
        }
        
        if (intervals.length > 1) {
            const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
            const stdDev = Math.sqrt(variance);
            
            // 如果标准差很小，说明时间间隔很均匀，可能是瞎编的
            if (stdDev / avg < 0.1) {
                issues.push(`均匀分布的timeline (变异系数: ${(stdDev/avg).toFixed(3)})`);
            }
        }
    }
    
    // 检查3: 有日期但matched_posts为0或不匹配
    if (ts.timeline && ts.timeline.length > 0 && ts.matched_posts === 0) {
        issues.push('timeline有数据但matched_posts为0');
    }
    
    return { hasIssues: issues.length > 0, issues };
}

function main() {
    console.log('=== Phase 1: 识别瞎编数据 ===\n');
    
    const db = loadDatabase();
    const restaurants = db.restaurants;
    
    let totalWithTimeSeries = 0;
    let totalSynthetic = 0;
    let totalUniform = 0;
    let totalNullTimeline = 0;
    
    const problematicRestaurants = [];
    
    for (const restaurant of restaurants) {
        if (!restaurant.time_series) continue;
        
        totalWithTimeSeries++;
        const result = checkSyntheticData(restaurant);
        
        const ts = restaurant.time_series;
        
        if (result.hasIssues) {
            problematicRestaurants.push({
                id: restaurant.id,
                name: restaurant.name,
                issues: result.issues,
                data_source: ts.data_source,
                timeline_length: ts.timeline?.length || 0,
                matched_posts: ts.matched_posts
            });
        }
        
        if (ts.data_source === 'synthetic') totalSynthetic++;
        if (result.issues.some(i => i.includes('均匀分布'))) totalUniform++;
        if (!ts.timeline || ts.timeline.length === 0) totalNullTimeline++;
    }
    
    console.log(`总餐厅数: ${restaurants.length}`);
    console.log(`有时间序列数据的餐厅: ${totalWithTimeSeries}`);
    console.log(`synthetic数据源: ${totalSynthetic}`);
    console.log(`均匀分布timeline: ${totalUniform}`);
    console.log(`空timeline: ${totalNullTimeline}`);
    console.log(`\n问题餐厅详情 (${problematicRestaurants.length}家):`);
    
    for (const r of problematicRestaurants) {
        console.log(`\n- ${r.name} (${r.id})`);
        console.log(`  问题: ${r.issues.join(', ')}`);
        console.log(`  timeline: ${r.timeline_length}条, matched_posts: ${r.matched_posts}`);
    }
    
    // 统计所有sources
    const allSources = new Set();
    for (const r of restaurants) {
        if (r.sources) {
            r.sources.forEach(s => allSources.add(s));
        }
    }
    
    console.log(`\n\n=== Post Detail文件统计 ===`);
    console.log(`Post Detail文件数: ${fs.readdirSync(POST_DETAILS_DIR).filter(f => f.endsWith('.json')).length}`);
    console.log(`唯一sources数: ${allSources.size}`);
    
    // 检查哪些sources没有post detail文件
    const missingFiles = [];
    for (const source of allSources) {
        const filePath = path.join(POST_DETAILS_DIR, `${source}.json`);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(source);
        }
    }
    console.log(`缺失post detail的sources: ${missingFiles.length}个`);
    if (missingFiles.length > 0) {
        console.log('  ' + missingFiles.join(', '));
    }
    
    return { problematicRestaurants, db };
}

main();
