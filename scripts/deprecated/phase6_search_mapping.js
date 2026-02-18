#!/usr/bin/env node
/**
 * Phase 6: 更新搜索映射
 * 生成场景标签映射：约会→[r001, r003], 家庭聚餐→[r002, r005]
 */
const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('🔍 Phase 6: 更新搜索映射');
console.log('='.repeat(70));

// 加载数据库
const dbPath = path.join(__dirname, '..', 'data', 'current', 'restaurant_database_v5.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log(`\n📊 加载数据库: ${db.restaurants.length} 家餐厅`);

// 场景标签映射规则
const scenarioMappings = {
    '约会': ['浪漫', '氛围', '安静', '精致', '日料', '法餐', '牛排'],
    '家庭聚餐': ['家常', '量大', '实惠', '中餐', '粤菜', '川菜', '适合家庭'],
    '商务宴请': ['高端', '包间', '正式', '粤菜', '海鲜', '精致'],
    '朋友聚会': ['热闹', '烧烤', '火锅', '啤酒', '氛围'],
    '一人食': ['快餐', '简餐', '拉面', '便当', '便宜'],
    '早茶': ['早茶', '点心', 'dimsum', '港式', '茶餐厅'],
    '夜宵': ['烧烤', '火锅', '深夜', '24小时'],
    '辣食爱好者': ['辣', '川菜', '湘菜', '火锅', '麻辣'],
    '健康轻食': ['轻食', '沙拉', '健康', '有机', '素食'],
    '异国料理': ['日料', '韩料', '泰料', '越南', '印度', '墨西哥']
};

// 区域映射
const areaMappings = {
    'Cupertino': ['Cupertino', '库比蒂诺'],
    'Fremont': ['Fremont', '弗里蒙特', '东湾'],
    'Sunnyvale': ['Sunnyvale', '桑尼维尔'],
    'Milpitas': ['Milpitas', '米尔皮塔斯'],
    'San Jose': ['San Jose', '圣何塞', '南湾'],
    'Mountain View': ['Mountain View', '山景城'],
    'Palo Alto': ['Palo Alto', '帕罗奥图', '半岛'],
    '旧金山': ['旧金山', 'San Francisco', '三藩市']
};

// 构建映射
const searchMapping = {
    version: '5.2',
    generated_at: new Date().toISOString(),
    scenarios: {},
    areas: {},
    cuisines: {},
    all_restaurants: db.restaurants.map(r => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine || '待确认',
        area: r.area || '湾区',
        verified: r.verified || false
    }))
};

// 场景映射
for (const [scenario, keywords] of Object.entries(scenarioMappings)) {
    const matched = [];
    for (const r of db.restaurants) {
        const text = `${r.name} ${r.cuisine || ''} ${JSON.stringify(r.llmMentions || [])}`.toLowerCase();
        if (keywords.some(k => text.includes(k.toLowerCase()))) {
            matched.push(r.id);
        }
    }
    if (matched.length > 0) {
        searchMapping.scenarios[scenario] = [...new Set(matched)];
    }
}

// 区域映射
for (const [area, keywords] of Object.entries(areaMappings)) {
    const matched = [];
    for (const r of db.restaurants) {
        const text = `${r.area || ''} ${r.location || ''}`.toLowerCase();
        if (keywords.some(k => text.includes(k.toLowerCase()))) {
            matched.push(r.id);
        }
    }
    if (matched.length > 0) {
        searchMapping.areas[area] = [...new Set(matched)];
    }
}

// 菜系映射
const cuisineTypes = {};
for (const r of db.restaurants) {
    const cuisine = r.cuisine || '待确认';
    if (!cuisineTypes[cuisine]) {
        cuisineTypes[cuisine] = [];
    }
    cuisineTypes[cuisine].push(r.id);
}
searchMapping.cuisines = cuisineTypes;

// 保存映射
const mappingPath = path.join(__dirname, '..', 'data', 'current', 'search_mapping.json');
fs.writeFileSync(mappingPath, JSON.stringify(searchMapping, null, 2));

console.log(`\n✅ 搜索映射已生成`);
console.log(`   场景标签: ${Object.keys(searchMapping.scenarios).length} 个`);
console.log(`   区域标签: ${Object.keys(searchMapping.areas).length} 个`);
console.log(`   菜系标签: ${Object.keys(searchMapping.cuisines).length} 个`);
console.log(`   保存至: data/current/search_mapping.json`);

// 打印映射摘要
console.log('\n📋 映射摘要:');
console.log('\n  场景映射:');
for (const [k, v] of Object.entries(searchMapping.scenarios)) {
    console.log(`    ${k}: ${v.length} 家餐厅`);
}

console.log('\n  区域映射:');
for (const [k, v] of Object.entries(searchMapping.areas)) {
    console.log(`    ${k}: ${v.length} 家餐厅`);
}

console.log('\n' + '='.repeat(70));
console.log('✅ Phase 6 完成!');
console.log('='.repeat(70));
