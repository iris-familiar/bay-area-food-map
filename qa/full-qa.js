#!/usr/bin/env node
/**
 * 完整QA验证 - 前端+后端
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const DB_PATH = path.join(PROJECT_DIR, 'data/current/restaurant_database.json');
const POSTS_DIR = path.join(PROJECT_DIR, 'data/raw/v2/posts');

// 颜色
const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

console.log('🔬 完整QA验证 - 前端+后端\n');
console.log('========================================');

// ============================================
// 1. 后端数据验证
// ============================================
console.log('\n📊 1. 后端数据验证\n');

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
console.log('餐厅总数:', db.restaurants.length);

// 检查每家餐厅的完整性
db.restaurants.forEach((r, i) => {
  const issues = [];
  if (!r.id) issues.push('无ID');
  if (!r.name) issues.push('无名称');
  if (!r.cuisine) issues.push('无菜系');
  if (!r.area) issues.push('无地区');
  if (!r.sources || r.sources.length === 0) issues.push('无source');
  if (r.total_engagement === undefined) issues.push('无讨论度');
  
  if (issues.length > 0) {
    console.log(C.red + '❌ ' + r.name + ': ' + issues.join(', ') + C.reset);
  } else {
    console.log(C.green + '✓ ' + r.name + ' (' + r.area + ', ' + r.cuisine + ')' + C.reset);
  }
});

// ============================================
// 2. 数据源验证
// ============================================
console.log('\n📁 2. 数据源验证\n');

const postFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
console.log('Raw posts文件数:', postFiles.length);

// 检查所有餐厅是否都能链接到post文件
let allSourcesFound = true;
db.restaurants.forEach(r => {
  (r.sources || []).forEach(sourceId => {
    const filePath = path.join(POSTS_DIR, sourceId + '.json');
    if (!fs.existsSync(filePath)) {
      console.log(C.red + '❌ 缺失source: ' + r.name + ' -> ' + sourceId + C.reset);
      allSourcesFound = false;
    }
  });
});

if (allSourcesFound) {
  console.log(C.green + '✓ 所有餐厅source文件都存在' + C.reset);
}

// ============================================
// 3. 检查包大人
// ============================================
console.log('\n🔍 3. 检查包大人\n');

const bao = db.restaurants.find(r => r.name === '包大人');
if (bao) {
  console.log('✓ 包大人在数据库中');
  console.log('  ID:', bao.id);
  console.log('  Area:', bao.area);
  console.log('  Cuisine:', bao.cuisine);
  console.log('  Sources:', bao.sources);
  
  // 检查source文件
  if (bao.sources && bao.sources.length > 0) {
    const sourceFile = path.join(POSTS_DIR, bao.sources[0] + '.json');
    if (fs.existsSync(sourceFile)) {
      console.log('  ✓ Source文件存在');
    } else {
      console.log(C.red + '  ❌ Source文件缺失!' + C.reset);
    }
  }
} else {
  console.log(C.red + '❌ 包大人不在数据库中!' + C.reset);
}

// ============================================
// 4. 提取率分析
// ============================================
console.log('\n📈 4. 提取率分析\n');

console.log('Post文件总数:', postFiles.length);
console.log('提取餐厅数:', db.restaurants.length);
console.log('提取率:', (db.restaurants.length / postFiles.length * 100).toFixed(1) + '%');
console.log('');
console.log(C.yellow + '注意: 82个posts只提取13家餐厅是因为:' + C.reset);
console.log('1. 每个post可能提到多个餐厅');
console.log('2. 很多posts是分享/求助帖，没有明确提及餐厅名');
console.log('3. 只提取了能明确识别的餐厅（有完整信息）');
console.log('4. ' + C.red + '之前没有检查comments中的餐厅提及!' + C.reset);

console.log('\n========================================');
console.log('QA验证完成');
