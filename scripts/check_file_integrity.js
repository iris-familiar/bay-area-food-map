#!/usr/bin/env node
/**
 * 文件完整性检查脚本
 * 防止 symlink 断裂和路径不一致
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data/current');

let errors = [];
let warnings = [];

function error(msg) {
    errors.push(msg);
    console.log(`  ❌ ${msg}`);
}

function warn(msg) {
    warnings.push(msg);
    console.log(`  ⚠️  ${msg}`);
}

function ok(msg) {
    console.log(`  ✅ ${msg}`);
}

console.log('🔍 文件完整性检查...\n');

// 1. 检查数据库 symlink
console.log('📁 检查数据库文件...');
const dbPath = path.join(DATA_DIR, 'restaurant_database.json');
if (!fs.existsSync(dbPath)) {
    error('restaurant_database.json 不存在');
} else {
    const stats = fs.lstatSync(dbPath);
    if (!stats.isSymbolicLink()) {
        error('restaurant_database.json 不是 symlink');
    } else {
        const target = fs.readlinkSync(dbPath);
        ok(`symlink 指向: ${target}`);
        
        // 检查目标文件是否存在
        const targetPath = path.join(DATA_DIR, target);
        if (!fs.existsSync(targetPath)) {
            error(`symlink 目标不存在: ${target}`);
        } else {
            ok('symlink 目标文件存在');
        }
    }
}

// 2. 检查 HTML 引用的路径
console.log('\n🌐 检查 HTML 路径...');
const htmlPath = path.join(PROJECT_ROOT, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// 检查是否使用了版本化文件名
if (htmlContent.includes('restaurant_database_v5_ui.json') || 
    htmlContent.includes('restaurant_database_v5_standardized.json') ||
    htmlContent.includes('restaurant_database_clean.json') ||
    htmlContent.includes('restaurant_database_final.json')) {
    error('HTML 中硬编码了版本化文件名，应该使用 restaurant_database.json');
} else if (htmlContent.includes("restaurant_database.json")) {
    ok('HTML 使用正确的数据库路径');
} else {
    warn('无法确认 HTML 中的数据库路径');
}

// 3. 检查脚本引用的路径
console.log('\n📜 检查脚本路径...');
const scriptsDir = path.join(PROJECT_ROOT, 'scripts');
const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));

let scriptErrors = 0;
scripts.forEach(script => {
    const content = fs.readFileSync(path.join(scriptsDir, script), 'utf-8');
    // 排除检查脚本自己
    if (script === 'check_file_integrity.js') return;
    
    if (content.includes('restaurant_database_v5_ui.json') || 
        content.includes('restaurant_database_v5_standardized.json') ||
        content.includes('restaurant_database_clean.json') ||
        content.includes('restaurant_database_final.json')) {
        error(`脚本 ${script} 硬编码了版本化文件名`);
        scriptErrors++;
    }
});

if (scriptErrors === 0) {
    ok('所有脚本使用正确的数据库路径');
}

// 4. 检查数据库字段兼容性
console.log('\n💾 检查数据库字段...');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
if (db.restaurants && db.restaurants.length > 0) {
    const first = db.restaurants[0];
    
    const requiredFields = ['name', 'xiaohongshu_id', 'region', 'city', 'engagement', 'sentiment_score'];
    const missing = requiredFields.filter(f => !(f in first));
    
    if (missing.length > 0) {
        error(`数据库缺少必需字段: ${missing.join(', ')}`);
    } else {
        ok('数据库包含所有必需字段');
    }
    
    // 检查向后兼容字段
    if (!('area' in first)) {
        warn('数据库缺少向后兼容字段: area');
    }
} else {
    error('数据库为空或格式错误');
}

// 5. 检查 HTML 字段兼容性
console.log('\n🔄 检查字段兼容性...');
const requiredChecks = [
    ['region/city 兼容', /r\.region.*\|\|.*r\.area|r\.city.*\|\|.*r\.area/],
    ['engagement 字段', /\.engagement/],
    ['sentiment_score 字段', /r\.sentiment_score/]
];

requiredChecks.forEach(([name, regex]) => {
    if (regex.test(htmlContent)) {
        ok(`${name} 处理正确`);
    } else {
        warn(`${name} 可能未处理`);
    }
});

// 6. 检查配置文件格式
console.log('\n⚙️  检查配置文件...');
const correctionsPath = path.join(PROJECT_ROOT, 'data/corrections.json');
if (fs.existsSync(correctionsPath)) {
    const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf-8'));
    if (Array.isArray(corrections)) {
        ok('corrections.json 格式正确 (数组)');
    } else {
        error('corrections.json 格式错误 (应该是数组)');
    }
}

const rulesPath = path.join(PROJECT_ROOT, 'data/quality_rules.json');
if (fs.existsSync(rulesPath)) {
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    if (rules.rules && Array.isArray(rules.rules)) {
        ok('quality_rules.json 格式正确');
    } else {
        error('quality_rules.json 格式错误 (缺少 rules 字段)');
    }
}

// 总结
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ 所有检查通过！');
    process.exit(0);
} else {
    console.log(`❌ 发现 ${errors.length} 个错误, ${warnings.length} 个警告`);
    if (errors.length > 0) {
        console.log('\n错误列表:');
        errors.forEach(e => console.log(`  - ${e}`));
    }
    process.exit(1);
}
