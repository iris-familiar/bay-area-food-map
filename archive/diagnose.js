#!/usr/bin/env node
/**
 * 网站加载诊断工具
 */

const http = require('http');

const BASE_URL = 'http://localhost:8080';

console.log('🔍 网站加载诊断...\n');

// 测试1: 检查HTML
http.get(BASE_URL, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('✓ HTML 页面大小:', data.length, 'bytes');
        
        // 检查关键元素
        const checks = [
            ['loading div', /id="loading"/],
            ['content div', /id="content"/],
            ['正确数据库路径', /fetch\('data\/current\/restaurant_database\.json/],
            ['applyFilters函数', /function applyFilters/],
            ['隐藏loading代码', /getElementById\(['"]loading['"]\)\.classList\.add\(['"]hidden['"]\)/],
            ['错误处理', /catch.*error/]
        ];
        
        checks.forEach(([name, regex]) => {
            const found = regex.test(data);
            console.log(`${found ? '✓' : '✗'} ${name}: ${found ? '存在' : '缺失'}`);
        });
        
        // 检查 regionCities 映射
        const regionMatch = data.match(/const regionCities = \{([^}]+)\}/s);
        if (regionMatch) {
            console.log('\n✓ regionCities 映射已定义');
        }
        
        // 检查 regionValueMap
        const valueMapMatch = data.match(/const regionValueMap = \{([^}]+)\}/s);
        if (valueMapMatch) {
            console.log('✓ regionValueMap 映射已定义');
        }
    });
}).on('error', (err) => {
    console.log('✗ 无法连接到服务器:', err.message);
});

// 测试2: 检查数据库
setTimeout(() => {
    http.get(`${BASE_URL}/data/current/restaurant_database.json`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const db = JSON.parse(data);
                console.log('\n📊 数据库检查:');
                console.log(`  ✓ 餐厅数量: ${db.restaurants?.length || 0}`);
                
                if (db.restaurants?.length > 0) {
                    const first = db.restaurants[0];
                    console.log(`  ✓ 第一个餐厅: ${first.name}`);
                    console.log(`  ✓ 字段检查:`);
                    console.log(`    - xiaohongshu_id: ${first.xiaohongshu_id ? '✓' : '✗'}`);
                    console.log(`    - region: ${first.region ? '✓' : '✗'}`);
                    console.log(`    - city: ${first.city ? '✓' : '✗'}`);
                    console.log(`    - engagement: ${typeof first.engagement === 'number' ? '✓' : '✗'}`);
                }
            } catch (e) {
                console.log('✗ 数据库 JSON 解析失败:', e.message);
            }
        });
    });
}, 100);

// 总结
setTimeout(() => {
    console.log('\n📝 诊断完成');
    console.log('如果网站仍显示"正在加载"，请检查浏览器控制台获取详细错误信息');
}, 200);
