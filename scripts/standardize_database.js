#!/usr/bin/env node
/**
 * 数据库字段标准化脚本 - 安全版本 (STRICT GOVERNANCE)
 * 修复字段名不一致问题
 * 
 * RULE: 如果数据已经完整，不要覆盖！
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/current/restaurant_database.json');
const BACKUP_DIR = path.join(__dirname, '../data/backup');

// 先运行验证
console.log('🔍 Step 1: 验证当前数据状态...');
const { execSync } = require('child_process');

try {
    execSync('node ' + path.join(__dirname, 'verify_data_integrity.js'), { stdio: 'inherit' });
    console.log('\n✅ 数据验证通过，无需修复');
    process.exit(0);
} catch (e) {
    console.log('\n⚠️  数据需要修复，继续执行...\n');
}

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 读取数据库
console.log('📖 Step 2: 读取数据库...');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

// 创建备份
const backupPath = path.join(BACKUP_DIR, `restaurant_database_pre_standardize_${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(db, null, 2));
console.log(`✓ 备份已创建: ${backupPath}`);

// 标准化每个餐厅
console.log('🔧 Step 3: 标准化字段...');
let fixedCount = 0;

const standardized = db.restaurants.map(r => {
    // 只修复缺失的字段，不要覆盖已有数据！
    const updates = {};
    
    // xiaohongshu_id: 只在缺失时添加
    if (!r.xiaohongshu_id && r.id) {
        updates.xiaohongshu_id = r.id;
        fixedCount++;
    }
    
    // region: 只在缺失时推断
    if (!r.region && r.area) {
        const regionMap = {
            'South Bay': 'South Bay', 'Fremont': 'South Bay', 'Milpitas': 'South Bay',
            'Sunnyvale': 'South Bay', 'Cupertino': 'South Bay', 'San Jose': 'South Bay',
            'Mountain View': 'South Bay', 'Santa Clara': 'South Bay', 'Campbell': 'South Bay',
            'East Bay': 'East Bay', 'Hayward': 'East Bay', 'San Leandro': 'East Bay',
            'Peninsula': 'Peninsula', 'Palo Alto': 'Peninsula', 'San Mateo': 'Peninsula'
        };
        updates.region = regionMap[r.area] || r.area;
        fixedCount++;
    }
    
    // city: 只在缺失时从地址提取
    if (!r.city && r.address) {
        const match = r.address.match(/,\s*([A-Za-z\s]+),?\s*CA\s*\d{5}/i);
        if (match) {
            updates.city = match[1].trim();
            fixedCount++;
        }
    }
    
    // engagement: 只在缺失或无效时修复
    if (typeof r.engagement !== 'number' || r.engagement === 0) {
        if (r.total_engagement && r.total_engagement > 0) {
            updates.engagement = r.total_engagement;
            fixedCount++;
        }
    }
    
    // sentiment_score: 只在缺失时填充
    if (r.sentiment_score === null || r.sentiment_score === undefined) {
        updates.sentiment_score = r.sentiment_details?.score || 0.5;
        fixedCount++;
    }
    
    // 返回合并后的对象
    return { ...r, ...updates };
});

// 更新数据库
db.restaurants = standardized;
db.metadata = {
    ...(db.metadata || {}),
    version: (db.metadata?.version || '5') + '.1',
    updated_at: new Date().toISOString(),
    standardization_applied: true
};

// 写入数据库
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`✓ 已修复 ${fixedCount} 个字段`);
console.log(`✓ 数据库已更新: ${DB_PATH}`);

// 再次验证
console.log('\n🔍 Step 4: 再次验证...');
try {
    execSync('node ' + path.join(__dirname, 'verify_data_integrity.js'), { stdio: 'inherit' });
    console.log('\n✅ 修复成功！');
} catch (e) {
    console.log('\n❌ 修复后验证失败');
    process.exit(1);
}
