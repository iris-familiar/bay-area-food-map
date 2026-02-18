#!/usr/bin/env node
/**
 * 数据清理脚本 - Phase 3: 清除所有瞎编数据
 * 原则：宁可放null，也不要瞎编数据
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = 'data/current/restaurant_database.json';
const POST_DETAILS_DIR = 'data/raw/post_details';
const ARCHIVE_DIR = 'data/archive';

function loadDatabase() {
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(content);
}

function saveDatabase(db, version) {
    // 备份原文件
    if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(ARCHIVE_DIR, `restaurant_database_backup_${timestamp}_v${version}.json`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`  已备份到: ${backupPath}`);
    
    // 保存新文件
    db.version = version;
    db.updated_at = new Date().toISOString().split('T')[0];
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`  已更新数据库: ${DB_PATH}`);
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

function clearSyntheticData(restaurant) {
    const ts = restaurant.time_series;
    if (!ts) return false;
    
    // 只处理synthetic数据
    if (ts.data_source !== 'synthetic') return false;
    
    // 获取总互动数（保留真实值）
    const totalEngagement = restaurant.metrics?.discussion_volume?.total_engagement || 0;
    
    // 清除瞎编数据，设为null或空
    restaurant.time_series = {
        timeline: [],  // 空数组，不瞎编
        first_mentioned: null,
        peak_discussion_date: null,
        total_engagement: totalEngagement,  // 保留已知的总互动数
        trend_7d: null,  // 未知设为null
        trend_30d: null,
        data_source: 'pending',  // 标记为待获取
        matched_posts: 0
    };
    
    return true;
}

function main() {
    console.log('=== Phase 3: 清除所有瞎编数据 ===\n');
    
    const db = loadDatabase();
    const restaurants = db.restaurants;
    
    let clearedCount = 0;
    let alreadyCleanCount = 0;
    let realDataCount = 0;
    
    for (const restaurant of restaurants) {
        const ts = restaurant.time_series;
        
        if (!ts) {
            alreadyCleanCount++;
            continue;
        }
        
        if (ts.data_source === 'synthetic') {
            if (clearSyntheticData(restaurant)) {
                clearedCount++;
                console.log(`✓ 已清理: ${restaurant.name} (${restaurant.id})`);
            }
        } else if (ts.data_source === 'real' || ts.data_source === 'pending' || ts.data_source === 'direct_match') {
            realDataCount++;
        }
    }
    
    console.log(`\n=== 清理结果 ===`);
    console.log(`已清理synthetic数据: ${clearedCount}家`);
    console.log(`原有真实数据: ${realDataCount}家`);
    console.log(`无time_series数据: ${alreadyCleanCount}家`);
    
    // 验证
    const remainingSynthetic = restaurants.filter(r => r.time_series?.data_source === 'synthetic').length;
    console.log(`\n验证: 剩余synthetic数据 = ${remainingSynthetic} (应为0)`);
    
    // 保存
    saveDatabase(db, '4.0-cleaned');
    
    // 生成统计
    const pendingCount = restaurants.filter(r => r.time_series?.data_source === 'pending').length;
    const realCount = restaurants.filter(r => r.time_series?.data_source !== 'synthetic' && r.time_series?.data_source !== 'pending').length;
    
    console.log(`\n=== 最终数据质量 ===`);
    console.log(`真实数据: ${realCount}家`);
    console.log(`待获取数据: ${pendingCount}家`);
    console.log(`数据完整率: ${((realCount / restaurants.length) * 100).toFixed(1)}%`);
    
    return { clearedCount, pendingCount, realCount };
}

main();
