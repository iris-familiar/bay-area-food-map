#!/usr/bin/env node
/**
 * STRICT GOVERNANCE: 数据验证脚本
 * 验证数据库完整性，返回exit code 0表示成功
 * 
 * 关键字段缺失 = 失败
 * 可选字段缺失 = 警告（不失败）
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/current/restaurant_database.json');

let criticalErrors = [];
let warnings = [];

console.log('🔍 执行数据完整性验证...\n');

// 1. 检查文件是否存在
if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 数据库文件不存在');
    process.exit(1);
}

// 2. 检查是否为symlink
const stats = fs.lstatSync(DB_PATH);
if (!stats.isSymbolicLink()) {
    console.error('❌ 数据库文件不是symlink');
    process.exit(1);
}
console.log('✓ 数据库是symlink');

// 3. 读取并解析数据
let db;
try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
} catch (e) {
    console.error('❌ 数据库JSON解析失败:', e.message);
    process.exit(1);
}

// 4. 检查餐厅数据
const restaurants = db.restaurants || [];
console.log(`✓ 餐厅总数: ${restaurants.length}`);

// 关键字段（必须有）
const criticalFields = ['name', 'engagement', 'sentiment_score'];
// 可选字段（建议有，但不是必须）
const optionalFields = ['google_rating', 'city', 'region', 'address'];

restaurants.forEach((r, idx) => {
    // 检查关键字段
    criticalFields.forEach(field => {
        if (r[field] === undefined || r[field] === null) {
            criticalErrors.push(`餐厅 #${idx} (${r.name || 'unnamed'}): ${field} 为空（关键字段）`);
        }
    });
    
    // 检查可选字段（只警告）
    optionalFields.forEach(field => {
        if (r[field] === undefined || r[field] === null || r[field] === '') {
            // 只记录前5个警告，避免刷屏
            if (warnings.length < 5) {
                warnings.push(`餐厅 #${idx} (${r.name || 'unnamed'}): ${field} 为空`);
            }
        }
    });
});

// 5. 检查样本数据
const sample = restaurants[0];
console.log('\n📊 样本餐厅数据:');
console.log(`  名称: ${sample.name}`);
console.log(`  engagement: ${sample.engagement}`);
console.log(`  google_rating: ${sample.google_rating || 'N/A'}`);
console.log(`  city: ${sample.city || 'N/A'}`);
console.log(`  region: ${sample.region || 'N/A'}`);

// 关键检查
if (sample.engagement === undefined || sample.engagement === null) {
    criticalErrors.push('样本餐厅 engagement 为空');
}

// 6. 结果
console.log('\n' + '='.repeat(50));

if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} 个警告（非关键）:`);
    warnings.forEach(w => console.log(`  - ${w}`));
    if (warnings.length >= 5) {
        console.log(`  ... 还有其他警告`);
    }
}

if (criticalErrors.length === 0) {
    console.log('✅ 关键验证通过（警告可忽略）');
    process.exit(0);
} else {
    console.log(`❌ 发现 ${criticalErrors.length} 个关键错误:`);
    criticalErrors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
}
