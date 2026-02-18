#!/usr/bin/env node
/**
 * 轻量级端到端验证
 * 不依赖浏览器，直接检查数据完整性和可访问性
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';

console.log('🧪 开始轻量级 E2E 验证...\n');

let passCount = 0;
let failCount = 0;

function test(name, condition, error = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passCount++;
  } else {
    console.log(`  ❌ ${name}${error ? ': ' + error : ''}`);
    failCount++;
  }
}

// 测试 1: 服务器可访问
console.log('📡 测试服务器可访问性...');
const checkServer = new Promise((resolve) => {
  http.get(BASE_URL, (res) => {
    test('HTTP 服务器响应', res.statusCode === 200);
    resolve();
  }).on('error', () => {
    test('HTTP 服务器响应', false, '无法连接到服务器');
    resolve();
  });
});

// 测试 2: 数据库文件可访问
console.log('\n💾 测试数据文件可访问性...');
const checkDataFile = new Promise((resolve) => {
  http.get(`${BASE_URL}/data/current/restaurant_database.json`, (res) => {
    test('数据库文件可访问', res.statusCode === 200);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const db = JSON.parse(data);
        test('数据库 JSON 有效', db.restaurants && Array.isArray(db.restaurants));
        test('餐厅数量 > 0', db.restaurants.length > 0, `实际: ${db.restaurants.length}`);
        
        // 检查字段
        const first = db.restaurants[0];
        test('餐厅有 xiaohongshu_id', first.xiaohongshu_id !== undefined);
        test('餐厅有 region', first.region !== undefined);
        test('餐厅有 city', first.city !== undefined);
        test('餐厅有 engagement', typeof first.engagement === 'number');
        test('餐厅有 sentiment_score', typeof first.sentiment_score === 'number');
        
        // 检查月度图表数据
        const hasPostDetails = db.restaurants.some(r => 
          r.post_details && r.post_details.length > 0
        );
        test('有帖子详情数据', hasPostDetails);
        
      } catch (e) {
        test('数据库 JSON 有效', false, e.message);
      }
      resolve();
    });
  }).on('error', () => {
    test('数据库文件可访问', false, '无法访问');
    resolve();
  });
});

// 测试 3: HTML 文件包含必要元素
console.log('\n🌐 测试 HTML 结构...');
const checkHTML = new Promise((resolve) => {
  http.get(BASE_URL, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      test('包含标题', data.includes('湾区美食地图'));
      test('包含餐厅卡片容器', data.includes('id="restaurant-grid"'));
      test('包含筛选器', data.includes('id="cuisine-filter"'));
      test('包含 Modal', data.includes('id="detail-modal"'));
      test('包含月度图表代码', data.includes('generateEngagementChart'));
      test('包含 Swift Chart 风格', data.includes('chartGradient'));
      
      // 检查滚动24个月逻辑
      test('包含滚动24个月逻辑', data.includes('latestMonth = currentMonth - 1'));
      resolve();
    });
  }).on('error', () => {
    resolve();
  });
});

// 测试 4: 本地文件检查
console.log('\n📁 测试本地文件...');
const dbPath = path.join(__dirname, '../data/current/restaurant_database.json');
const stats = fs.lstatSync(dbPath);
test('数据库是符号链接', stats.isSymbolicLink());

const correctionsPath = path.join(__dirname, '../data/corrections.json');
if (fs.existsSync(correctionsPath)) {
  const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf-8'));
  test('corrections.json 是数组', Array.isArray(corrections));
}

const rulesPath = path.join(__dirname, '../data/quality_rules.json');
if (fs.existsSync(rulesPath)) {
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
  test('quality_rules.json 有 rules 字段', rules.rules !== undefined);
}

// 运行所有测试
Promise.all([checkServer, checkDataFile, checkHTML]).then(() => {
  console.log('\n' + '='.repeat(50));
  console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`);
  console.log('='.repeat(50));
  
  if (failCount === 0) {
    console.log('\n🎉 所有验证通过！网站可以正常使用。');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分验证失败，请检查上述问题。');
    process.exit(1);
  }
});
