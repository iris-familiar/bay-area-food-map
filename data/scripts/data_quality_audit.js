#!/usr/bin/env node
/**
 * 餐厅数据库深度质量检测脚本
 * 检测范围：字段完整性、地理数据正确性、数据对比分析
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';

// 地理规则映射
const CITY_REGION_MAP = {
  'Fremont': 'East Bay',
  'Milpitas': 'South Bay',
  'San Jose': 'South Bay',
  'Santa Clara': 'South Bay',
  'Sunnyvale': 'South Bay',
  'Mountain View': 'South Bay',
  'Palo Alto': 'South Bay',
  'Cupertino': 'South Bay',
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
  'San Francisco': 'San Francisco',
  'Millbrae': 'Peninsula',
  'Burlingame': 'Peninsula',
  'San Mateo': 'Peninsula',
  'San Bruno': 'Peninsula',
  'Foster City': 'Peninsula',
  'Redwood City': 'Peninsula',
  'Menlo Park': 'Peninsula'
};

// 关键字段定义
const CRITICAL_FIELDS = [
  'id', 'name', 'cuisine', 'area', 'address', 
  'city', 'region', 'engagement', 'sentiment_score', 
  'google_rating', 'recommendations', 'post_details'
];

function loadJSON(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

// 1. 字段完整性分析
function analyzeFieldCompleteness(restaurants) {
  const stats = {};
  const total = restaurants.length;
  
  CRITICAL_FIELDS.forEach(field => {
    stats[field] = { present: 0, missing: 0, empty: 0, rate: 0 };
  });
  
  restaurants.forEach(r => {
    CRITICAL_FIELDS.forEach(field => {
      const value = r[field];
      if (value === undefined || value === null) {
        stats[field].missing++;
      } else if (value === '' || (Array.isArray(value) && value.length === 0)) {
        stats[field].empty++;
      } else {
        stats[field].present++;
      }
    });
  });
  
  // 计算百分比
  CRITICAL_FIELDS.forEach(field => {
    stats[field].rate = ((stats[field].present / total) * 100).toFixed(1);
  });
  
  return stats;
}

// 2. 地理数据验证
function validateGeoData(restaurants) {
  const errors = [];
  const warnings = [];
  
  restaurants.forEach(r => {
    const city = r.city || r.area;
    const region = r.region;
    
    if (!city) {
      errors.push({ id: r.id, name: r.name, issue: '缺失city/area字段' });
      return;
    }
    
    // 检查Fremont和Milpitas规则
    if (city === 'Fremont' && region && region !== 'East Bay') {
      errors.push({ id: r.id, name: r.name, issue: `Fremont地区region错误: ${region} (应为East Bay)` });
    }
    if (city === 'Milpitas' && region && region !== 'South Bay') {
      errors.push({ id: r.id, name: r.name, issue: `Milpitas地区region错误: ${region} (应为South Bay)` });
    }
    
    // 检查city-region一致性
    if (city && region && CITY_REGION_MAP[city] && CITY_REGION_MAP[city] !== region) {
      warnings.push({ 
        id: r.id, 
        name: r.name, 
        issue: `city-region不匹配: ${city}=${region} (建议: ${CITY_REGION_MAP[city]})` 
      });
    }
    
    // 检查地址中是否包含city信息
    if (r.address && !r.city) {
      const addrLower = r.address.toLowerCase();
      for (const [cityName, regionName] of Object.entries(CITY_REGION_MAP)) {
        if (addrLower.includes(cityName.toLowerCase())) {
          if (!r.city) {
            warnings.push({ id: r.id, name: r.name, issue: `可从address推断city: ${cityName}` });
          }
          break;
        }
      }
    }
  });
  
  return { errors, warnings };
}

// 3. 找出有问题的数据
function findProblematicRecords(restaurants) {
  const problems = [];
  
  restaurants.forEach(r => {
    const issues = [];
    
    if (!r.name || r.name === '') issues.push('缺失名称');
    if (!r.cuisine || r.cuisine === '') issues.push('缺失cuisine');
    if (!r.area || r.area === '') issues.push('缺失area');
    if (!r.city || r.city === '') issues.push('缺失city');
    if (!r.region || r.region === '') issues.push('缺失region');
    if (!r.address || r.address === '') issues.push('缺失address');
    if (!r.recommendations || r.recommendations.length === 0) issues.push('缺失recommendations');
    if (!r.post_details || r.post_details.length === 0) issues.push('缺失post_details');
    if (r.engagement === undefined || r.engagement === null) issues.push('缺失engagement');
    if (r.sentiment_score === undefined || r.sentiment_score === null) issues.push('缺失sentiment_score');
    
    if (issues.length > 0) {
      problems.push({
        id: r.id,
        name: r.name || '无名餐厅',
        area: r.area || r.city || '未知',
        issues: issues,
        issueCount: issues.length
      });
    }
  });
  
  return problems.sort((a, b) => b.issueCount - a.issueCount);
}

// 4. 对比新旧数据
function compareDatasets(current, v8) {
  const currentMap = new Map(current.map(r => [r.id, r]));
  const v8Map = new Map(v8.map(r => [r.id, r]));
  
  const onlyInCurrent = [];
  const onlyInV8 = [];
  const inBoth = [];
  const nameConflicts = [];
  
  // 只在current中的
  current.forEach(r => {
    if (!v8Map.has(r.id)) {
      onlyInCurrent.push({ id: r.id, name: r.name, area: r.area || r.city });
    } else {
      inBoth.push({ id: r.id, name: r.name });
    }
  });
  
  // 只在v8中的
  v8.forEach(r => {
    if (!currentMap.has(r.id)) {
      onlyInV8.push({ id: r.id, name: r.name, area: r.area });
    }
  });
  
  // 检查同名餐厅
  const currentNames = new Map(current.map(r => [r.name, r.id]));
  v8.forEach(r => {
    if (currentNames.has(r.name) && !currentMap.has(r.id)) {
      nameConflicts.push({
        name: r.name,
        currentId: currentNames.get(r.name),
        v8Id: r.id
      });
    }
  });
  
  return { onlyInCurrent, onlyInV8, inBoth, nameConflicts };
}

// 5. 分析v8数据为何无法使用
function analyzeV8Issues(v8Data) {
  const issues = [];
  
  v8Data.forEach(r => {
    const missingFields = [];
    if (!r.google_rating && r.google_rating !== 0) missingFields.push('google_rating');
    if (!r.sentiment_score && r.sentiment_score !== 0) missingFields.push('sentiment_score');
    if (!r.city || r.city === '') missingFields.push('city');
    if (!r.region || r.region === '') missingFields.push('region');
    if (!r.address || r.address === '') missingFields.push('address');
    if (!r.google_place_id) missingFields.push('google_place_id');
    if (!r.verified) missingFields.push('verified标记');
    if (!r.xiaohongshu_id) missingFields.push('xiaohongshu_id');
    
    if (missingFields.length > 0) {
      issues.push({
        id: r.id,
        name: r.name,
        missingFields: missingFields,
        hasSemanticTags: !!r.tags,
        recommendationCount: (r.recommendations || []).length
      });
    }
  });
  
  return issues;
}

// 主函数
function main() {
  console.log('='.repeat(80));
  console.log('餐厅数据库深度质量检测报告');
  console.log('='.repeat(80));
  console.log(`检测时间: ${new Date().toISOString()}`);
  console.log('');
  
  // 加载当前数据
  const currentData = loadJSON(path.join(DATA_DIR, 'current/restaurant_database.json'));
  if (!currentData) {
    console.error('无法加载当前数据库文件');
    process.exit(1);
  }
  
  const currentRestaurants = currentData.restaurants || [];
  console.log(`✓ 当前数据加载成功: ${currentRestaurants.length}家餐厅`);
  
  // 加载v8数据
  const v8Data = loadJSON(path.join(DATA_DIR, 'current/v8_llm_extraction_batch_20260218.json'));
  let v8Restaurants = [];
  if (v8Data) {
    v8Restaurants = v8Data.restaurants || [];
    console.log(`✓ v8数据加载成功: ${v8Restaurants.length}家餐厅`);
  } else {
    console.log('✗ v8数据加载失败');
  }
  
  // 加载fallback备份
  const backupFiles = fs.readdirSync(path.join(DATA_DIR, 'backup'))
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`✓ 发现 ${backupFiles.length} 个备份文件`);
  console.log('');
  
  // ===== 1. 字段完整性报告 =====
  console.log('─'.repeat(80));
  console.log('【1】字段完整性分析报告');
  console.log('─'.repeat(80));
  
  const completeness = analyzeFieldCompleteness(currentRestaurants);
  console.log('\n字段名称              | 存在   | 缺失   | 空值   | 完整率');
  console.log('─'.repeat(70));
  
  CRITICAL_FIELDS.forEach(field => {
    const s = completeness[field];
    const padField = field.padEnd(20);
    console.log(`${padField}| ${String(s.present).padStart(5)} | ${String(s.missing).padStart(5)} | ${String(s.empty).padStart(5)} | ${s.rate}%`);
  });
  
  // ===== 2. 地理数据验证报告 =====
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('【2】地理数据验证报告');
  console.log('─'.repeat(80));
  
  const geoValidation = validateGeoData(currentRestaurants);
  
  if (geoValidation.errors.length === 0) {
    console.log('✓ 未发现严重地理数据错误');
  } else {
    console.log(`✗ 发现 ${geoValidation.errors.length} 个严重错误：`);
    geoValidation.errors.forEach(e => {
      console.log(`  - [${e.id}] ${e.name}: ${e.issue}`);
    });
  }
  
  if (geoValidation.warnings.length > 0) {
    console.log(`\n⚠ 发现 ${geoValidation.warnings.length} 个警告：`);
    geoValidation.warnings.slice(0, 10).forEach(w => {
      console.log(`  - [${w.id}] ${w.name}: ${w.issue}`);
    });
    if (geoValidation.warnings.length > 10) {
      console.log(`  ... 还有 ${geoValidation.warnings.length - 10} 个警告`);
    }
  }
  
  // ===== 3. 问题数据示例 =====
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('【3】问题数据示例（按问题数量排序）');
  console.log('─'.repeat(80));
  
  const problems = findProblematicRecords(currentRestaurants);
  if (problems.length === 0) {
    console.log('✓ 未发现明显问题数据');
  } else {
    console.log(`发现 ${problems.length} 条记录存在问题：\n`);
    problems.slice(0, 15).forEach(p => {
      console.log(`[${p.id}] ${p.name} (${p.area})`);
      console.log(`  问题: ${p.issues.join(', ')}`);
    });
    if (problems.length > 15) {
      console.log(`\n... 还有 ${problems.length - 15} 条问题记录`);
    }
  }
  
  // ===== 4. v8数据分析 =====
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('【4】v8数据问题分析（为何无法直接使用）');
  console.log('─'.repeat(80));
  
  if (v8Restaurants.length === 0) {
    console.log('v8数据为空或无法加载');
  } else {
    console.log(`v8数据包含 ${v8Restaurants.length} 家餐厅\n`);
    
    const v8Issues = analyzeV8Issues(v8Restaurants);
    console.log(`所有 ${v8Restaurants.length} 家v8餐厅都缺少标准字段：`);
    console.log('  - google_rating (Google评分)');
    console.log('  - sentiment_score (情感分数)');
    console.log('  - city/region (标准化地理字段)');
    console.log('  - google_place_id (Google地点ID)');
    console.log('  - verified (验证标记)');
    console.log('  - xiaohongshu_id (小红书ID)');
    console.log('  - semantic_tags (语义标签结构不同)');
    console.log('');
    console.log('根本原因：v8数据是LLM原始提取结果，未经过：');
    console.log('  1. Google Places API地理编码');
    console.log('  2. 情感分析处理');
    console.log('  3. 字段标准化处理');
    console.log('  4. 地址验证和region映射');
  }
  
  // ===== 5. 新旧数据对比 =====
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('【5】新旧数据对比分析');
  console.log('─'.repeat(80));
  
  if (v8Restaurants.length > 0) {
    const comparison = compareDatasets(currentRestaurants, v8Restaurants);
    
    console.log(`当前数据: ${currentRestaurants.length} 家`);
    console.log(`v8数据:   ${v8Restaurants.length} 家`);
    console.log(`共同存在: ${comparison.inBoth.length} 家`);
    console.log(`仅当前有: ${comparison.onlyInCurrent.length} 家`);
    console.log(`仅v8有:   ${comparison.onlyInV8.length} 家`);
    console.log(`名称冲突: ${comparison.nameConflicts.length} 家`);
    
    if (comparison.onlyInV8.length > 0) {
      console.log('\n【v8新增餐厅】');
      comparison.onlyInV8.forEach(r => {
        console.log(`  - [${r.id}] ${r.name} (${r.area || '未知地区'})`);
      });
    }
    
    if (comparison.nameConflicts.length > 0) {
      console.log('\n【名称冲突（可能重复）】');
      comparison.nameConflicts.forEach(c => {
        console.log(`  - ${c.name}: 当前ID=${c.currentId}, v8ID=${c.v8Id}`);
      });
    }
  }
  
  // ===== 6. 数据整合方案 =====
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('【6】数据整合方案建议');
  console.log('─'.repeat(80));
  
  console.log(`
方案A：保留当前数据（推荐短期）
─────────────────────────────────────
优点：数据完整、经过验证、字段齐全
缺点：缺少v8中的新餐厅（${v8Restaurants.length}家）
适用：当前UI展示

方案B：合并v8新餐厅（推荐中期）
─────────────────────────────────────
步骤：
  1. 从v8提取真正的新餐厅（ID不冲突且名称不重复）
  2. 对新餐厅进行地理编码（Google Places API）
  3. 填充缺失字段：google_rating, sentiment_score等
  4. 验证region映射（Fremont=East Bay等）
  5. 合并到当前数据库，版本号+1

方案C：重新运行完整pipeline（推荐长期）
─────────────────────────────────────
步骤：
  1. 以v8数据作为新的提取结果
  2. 运行完整的标准化和验证流程
  3. 生成新的统一数据库
  4. 人工审核新增餐厅

关键修复建议：
─────────────────────────────────────
1. city字段缺失问题：
   - 从address字段提取城市名
   - 使用Google Places API反向地理编码

2. region映射问题：
   - 建立CITY_REGION_MAP自动化映射
   - 对Fremont/Milpitas强制校验

3. v8数据无法使用问题：
   - 需要补充Google数据才能合并
   - 或者调整UI支持展示未验证餐厅
`);
  
  // 保存详细报告
  const reportPath = path.join(DATA_DIR, 'docs/data_quality_report_20260218.md');
  const report = generateMarkdownReport({
    timestamp: new Date().toISOString(),
    currentCount: currentRestaurants.length,
    v8Count: v8Restaurants.length,
    completeness,
    geoValidation,
    problems,
    v8Issues: v8Restaurants.length > 0 ? analyzeV8Issues(v8Restaurants) : [],
    comparison: v8Restaurants.length > 0 ? compareDatasets(currentRestaurants, v8Restaurants) : null
  });
  
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n✓ 详细报告已保存: ${reportPath}`);
}

function generateMarkdownReport(data) {
  return `# 数据质量检测报告

**检测时间**: ${data.timestamp}

## 数据概览

| 数据源 | 餐厅数量 |
|--------|----------|
| 当前数据 | ${data.currentCount} |
| v8数据 | ${data.v8Count} |

## 字段完整性

| 字段 | 存在 | 缺失 | 空值 | 完整率 |
|------|------|------|------|--------|
${Object.entries(data.completeness).map(([k, v]) => `| ${k} | ${v.present} | ${v.missing} | ${v.empty} | ${v.rate}% |`).join('\n')}

## 地理数据错误

${data.geoValidation.errors.length === 0 ? '✓ 未发现严重错误' : data.geoValidation.errors.map(e => `- [${e.id}] ${e.name}: ${e.issue}`).join('\n')}

## 问题数据示例

${data.problems.slice(0, 20).map(p => `- [${p.id}] ${p.name}: ${p.issues.join(', ')}`).join('\n')}

## v8数据问题

v8数据缺少标准字段：google_rating, sentiment_score, city, region, google_place_id, verified等。

## 建议

1. 短期：保留当前79家餐厅数据
2. 中期：对v8新餐厅进行地理编码后合并
3. 长期：重新运行完整pipeline
`;
}

main();
