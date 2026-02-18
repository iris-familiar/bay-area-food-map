#!/usr/bin/env node
/**
 * 数据质量快速修复脚本
 * 修复内容：
 * 1. 补充缺失的city字段（从area或address推断）
 * 2. 补充缺失的region字段（使用CITY_REGION_MAP）
 * 3. 标准化地理数据
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';

// 完整的城市映射表
const CITY_REGION_MAP = {
  // East Bay
  'Fremont': 'East Bay',
  'Newark': 'East Bay',
  'Union City': 'East Bay',
  'Hayward': 'East Bay',
  'Oakland': 'East Bay',
  'Berkeley': 'East Bay',
  'San Leandro': 'East Bay',
  'Dublin': 'East Bay',
  'Pleasanton': 'East Bay',
  'Livermore': 'East Bay',
  'San Ramon': 'East Bay',
  'Walnut Creek': 'East Bay',
  'Pleasant Hill': 'East Bay',
  'Concord': 'East Bay',
  'Richmond': 'East Bay',
  'El Cerrito': 'East Bay',
  'Albany': 'East Bay',
  'Alameda': 'East Bay',
  'Castro Valley': 'East Bay',
  'San Lorenzo': 'East Bay',
  'Ashland': 'East Bay',
  'Cherryland': 'East Bay',
  'Fairview': 'East Bay',
  
  // South Bay
  'San Jose': 'South Bay',
  'Santa Clara': 'South Bay',
  'Sunnyvale': 'South Bay',
  'Mountain View': 'South Bay',
  'Palo Alto': 'South Bay',
  'Cupertino': 'South Bay',
  'Milpitas': 'South Bay',
  'Campbell': 'South Bay',
  'Los Gatos': 'South Bay',
  'Saratoga': 'South Bay',
  'Los Altos': 'South Bay',
  'Menlo Park': 'South Bay',
  'Stanford': 'South Bay',
  'Gilroy': 'South Bay',
  'Morgan Hill': 'South Bay',
  
  // Peninsula
  'Millbrae': 'Peninsula',
  'Burlingame': 'Peninsula',
  'San Mateo': 'Peninsula',
  'San Bruno': 'Peninsula',
  'Foster City': 'Peninsula',
  'Redwood City': 'Peninsula',
  'San Carlos': 'Peninsula',
  'Belmont': 'Peninsula',
  'Half Moon Bay': 'Peninsula',
  'Pacifica': 'Peninsula',
  'Daly City': 'Peninsula',
  'South San Francisco': 'Peninsula',
  'Brisbane': 'Peninsula',
  'Colma': 'Peninsula',
  'Broadmoor': 'Peninsula',
  
  // San Francisco
  'San Francisco': 'San Francisco',
  'SF': 'San Francisco'
};

function extractCityFromAddress(address) {
  if (!address) return null;
  
  // 从地址中提取城市名 (格式: "..., City, CA ...")
  const match = address.match(/,\s*([A-Za-z\s]+),?\s*CA/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

function fixData() {
  console.log('='.repeat(60));
  console.log('数据质量修复工具');
  console.log('='.repeat(60));
  
  // 读取数据
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const restaurants = data.restaurants;
  
  console.log(`加载数据: ${restaurants.length} 家餐厅\n`);
  
  let fixedCityCount = 0;
  let fixedRegionCount = 0;
  let fixedByAddressCount = 0;
  
  const fixedRestaurants = restaurants.map(r => {
    const original = { ...r };
    let modified = false;
    
    // 1. 修复city字段（如果为空）
    if (!r.city || r.city === '') {
      // 优先使用area字段
      if (r.area && r.area !== '') {
        r.city = r.area;
        fixedCityCount++;
        modified = true;
      } 
      // 其次从address提取
      else if (r.address) {
        const extractedCity = extractCityFromAddress(r.address);
        if (extractedCity) {
          r.city = extractedCity;
          fixedByAddressCount++;
          modified = true;
        }
      }
    }
    
    // 2. 修复region字段（如果为空）
    if (!r.region || r.region === '') {
      const cityToLookup = r.city || r.area;
      if (cityToLookup && CITY_REGION_MAP[cityToLookup]) {
        r.region = CITY_REGION_MAP[cityToLookup];
        fixedRegionCount++;
        modified = true;
      }
    }
    
    // 3. 验证并修正Fremont/Milpitas规则
    if (r.city === 'Fremont' && r.region !== 'East Bay') {
      r.region = 'East Bay';
      modified = true;
    }
    if (r.city === 'Milpitas' && r.region !== 'South Bay') {
      r.region = 'South Bay';
      modified = true;
    }
    
    if (modified) {
      console.log(`[${r.id}] ${r.name}:`);
      if (!original.city && r.city) console.log(`  + city: ${r.city}`);
      if (!original.region && r.region) console.log(`  + region: ${r.region}`);
    }
    
    return r;
  });
  
  // 统计修复结果
  const stillMissingCity = fixedRestaurants.filter(r => !r.city || r.city === '').length;
  const stillMissingRegion = fixedRestaurants.filter(r => !r.region || r.region === '').length;
  
  console.log('\n' + '='.repeat(60));
  console.log('修复结果');
  console.log('='.repeat(60));
  console.log(`修复city字段: ${fixedCityCount} 家`);
  console.log(`  - 从address提取: ${fixedByAddressCount} 家`);
  console.log(`修复region字段: ${fixedRegionCount} 家`);
  console.log(`\n修复后仍缺失:`);
  console.log(`  - city: ${stillMissingCity} 家`);
  console.log(`  - region: ${stillMissingRegion} 家`);
  
  // 显示仍缺失的餐厅
  if (stillMissingCity > 0 || stillMissingRegion > 0) {
    console.log('\n仍缺失关键字段的餐厅:');
    fixedRestaurants
      .filter(r => (!r.city || r.city === '') || (!r.region || r.region === ''))
      .forEach(r => {
        console.log(`  - [${r.id}] ${r.name}: city=${r.city || 'N/A'}, region=${r.region || 'N/A'}`);
      });
  }
  
  // 保存修复后的数据
  data.restaurants = fixedRestaurants;
  data.version = (parseFloat(data.version) + 0.1).toFixed(1) + '-fixed';
  data.updated_at = new Date().toISOString();
  
  // 备份原文件
  const backupPath = DATA_FILE.replace('.json', `_backup_${Date.now()}.json`);
  fs.copyFileSync(DATA_FILE, backupPath);
  console.log(`\n✓ 原文件已备份: ${backupPath}`);
  
  // 写入修复后的文件
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ 修复后的数据已保存: ${DATA_FILE}`);
  console.log(`✓ 新版本号: ${data.version}`);
}

fixData();
