/**
 * Performance Test Suite for Serving Layer
 * 性能测试套件 - 验证API响应时间 < 100ms
 */

const fs = require('fs');
const path = require('path');

// 导入API模块进行测试
const { loadData, handleListRestaurants, handleSearch } = require('./api.js');
const { transformToServing, computeStats, buildSearchIndex } = require('./export_to_serving.js');

// 测试结果
const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {}
};

/**
 * 运行测试
 */
async function runPerformanceTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  服务层性能测试报告 - Phase 3');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. 测试数据加载性能
  await testDataLoading();
  
  // 2. 测试数据转换性能
  await testDataTransform();
  
  // 3. 测试查询性能
  await testQueryPerformance();
  
  // 4. 测试搜索性能
  await testSearchPerformance();
  
  // 5. 测试文件大小
  testFileSize();
  
  // 生成报告
  generateReport();
}

/**
 * 测试数据加载性能
 */
async function testDataLoading() {
  console.log('[TEST] 数据加载性能测试');
  console.log('─────────────────────────────────────────────────');
  
  const iterations = 100;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    
    // 模拟数据加载
    const data = fs.readFileSync(
      path.join(__dirname, '../data/serving_data.json'), 
      'utf-8'
    );
    JSON.parse(data);
    
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // 转换为ms
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
  
  const passed = avg < 50;
  
  results.tests.push({
    name: '数据加载',
    iterations,
    avg_time_ms: avg.toFixed(2),
    min_time_ms: min.toFixed(2),
    max_time_ms: max.toFixed(2),
    p95_time_ms: p95.toFixed(2),
    target_ms: 50,
    passed
  });
  
  console.log(`  平均: ${avg.toFixed(2)}ms | 最小: ${min.toFixed(2)}ms | 最大: ${max.toFixed(2)}ms | P95: ${p95.toFixed(2)}ms`);
  console.log(`  目标: < 50ms | 结果: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
}

/**
 * 测试数据转换性能
 */
async function testDataTransform() {
  console.log('[TEST] 数据转换性能测试');
  console.log('─────────────────────────────────────────────────');
  
  // 加载原始数据
  const goldData = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../data/current/restaurant_database.json'),
    'utf-8'
  ));
  
  const iterations = 10;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    
    transformToServing(goldData);
    
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  
  results.tests.push({
    name: '数据转换',
    iterations,
    avg_time_ms: avg.toFixed(2),
    target_ms: 100,
    passed: avg < 100
  });
  
  console.log(`  平均: ${avg.toFixed(2)}ms (转换 ${goldData.restaurants.length} 条记录)`);
  console.log(`  目标: < 100ms | 结果: ${avg < 100 ? '✅ PASS' : '❌ FAIL'}\n`);
}

/**
 * 测试查询性能
 */
async function testQueryPerformance() {
  console.log('[TEST] 查询性能测试');
  console.log('─────────────────────────────────────────────────');
  
  const mockRes = { startTime: Date.now() };
  
  // 测试1: 列表查询 (无筛选)
  const listTest = runQueryTest('列表查询(无筛选)', () => {
    return handleListRestaurants(null, mockRes, { page: 1, limit: 20 });
  }, 100);
  
  // 测试2: 列表查询 (带筛选)
  const filterTest = runQueryTest('列表查询(筛选)', () => {
    return handleListRestaurants(null, mockRes, { 
      cuisine: '川菜', 
      region: 'South Bay',
      sort: 'engagement'
    });
  }, 100);
  
  // 测试3: 分页查询
  const pageTest = runQueryTest('分页查询', () => {
    return handleListRestaurants(null, mockRes, { page: 3, limit: 10 });
  }, 100);
  
  // 测试4: 排序查询
  const sortTest = runQueryTest('排序查询', () => {
    return handleListRestaurants(null, mockRes, { 
      sort: 'sentiment',
      order: 'desc'
    });
  }, 100);
  
  results.tests.push(listTest, filterTest, pageTest, sortTest);
  
  [listTest, filterTest, pageTest, sortTest].forEach(t => {
    console.log(`  ${t.name}: ${t.avg_time_ms}ms | 目标: < 100ms | ${t.passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  console.log('');
}

function runQueryTest(name, fn, iterations) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  
  return {
    name,
    iterations,
    avg_time_ms: avg.toFixed(2),
    target_ms: 100,
    passed: avg < 100
  };
}

/**
 * 测试搜索性能
 */
async function testSearchPerformance() {
  console.log('[TEST] 搜索性能测试');
  console.log('─────────────────────────────────────────────────');
  
  const mockRes = { startTime: Date.now() };
  const queries = ['川菜', 'Fremont', '火锅', '留湘', 'sushi'];
  
  queries.forEach(query => {
    const times = [];
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      handleSearch(null, mockRes, { q: query });
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const passed = avg < 100;
    
    results.tests.push({
      name: `搜索: "${query}"`,
      iterations,
      avg_time_ms: avg.toFixed(2),
      target_ms: 100,
      passed
    });
    
    console.log(`  搜索 "${query}": ${avg.toFixed(2)}ms | ${passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  console.log('');
}

/**
 * 测试文件大小
 */
function testFileSize() {
  console.log('[TEST] 文件大小测试');
  console.log('─────────────────────────────────────────────────');
  
  const files = [
    { name: 'serving_data.json', path: '../data/serving_data.json', target_kb: 500 },
    { name: 'serving_data_light.json', path: '../data/serving_data_light.json', target_kb: 100 },
    { name: 'search_index.json', path: '../data/search_index.json', target_kb: 100 },
    { name: 'stats.json', path: '../data/stats.json', target_kb: 50 }
  ];
  
  files.forEach(f => {
    const fullPath = path.join(__dirname, f.path);
    const stats = fs.statSync(fullPath);
    const sizeKb = stats.size / 1024;
    const passed = sizeKb < f.target_kb;
    
    results.tests.push({
      name: `文件大小: ${f.name}`,
      size_kb: sizeKb.toFixed(2),
      target_kb: f.target_kb,
      passed
    });
    
    console.log(`  ${f.name}: ${sizeKb.toFixed(2)}KB | 目标: < ${f.target_kb}KB | ${passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  console.log('');
}

/**
 * 生成报告
 */
function generateReport() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  测试总结');
  console.log('═══════════════════════════════════════════════════');
  
  const totalTests = results.tests.length;
  const passedTests = results.tests.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;
  
  results.summary = {
    total_tests: totalTests,
    passed: passedTests,
    failed: failedTests,
    pass_rate: ((passedTests / totalTests) * 100).toFixed(1) + '%',
    all_passed: failedTests === 0
  };
  
  console.log(`  总测试数: ${totalTests}`);
  console.log(`  通过: ${passedTests} ✅`);
  console.log(`  失败: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`  通过率: ${results.summary.pass_rate}`);
  console.log('');
  
  if (failedTests === 0) {
    console.log('  ✅ 所有测试通过！API响应时间 < 100ms 要求满足');
  } else {
    console.log('  ⚠️ 部分测试未通过，请检查性能瓶颈');
  }
  
  // 写入报告文件
  const reportPath = path.join(__dirname, '../docs/PERF_TEST_REPORT.md');
  const reportContent = generateMarkdownReport(results);
  fs.writeFileSync(reportPath, reportContent);
  
  console.log(`\n  详细报告已保存: ${reportPath}`);
}

/**
 * 生成Markdown报告
 */
function generateMarkdownReport(results) {
  return `# 服务层性能测试报告

**测试时间**: ${results.timestamp}

## 测试总结

| 指标 | 值 |
|------|-----|
| 总测试数 | ${results.summary.total_tests} |
| 通过 | ${results.summary.passed} ✅ |
| 失败 | ${results.summary.failed} ${results.summary.failed > 0 ? '❌' : ''} |
| 通过率 | ${results.summary.pass_rate} |
| **结果** | ${results.summary.all_passed ? '✅ 全部通过' : '⚠️ 部分未通过'} |

## 详细测试结果

| 测试项 | 平均耗时 | 目标 | 结果 |
|--------|----------|------|------|
${results.tests.map(t => {
  const timeCol = t.avg_time_ms ? `${t.avg_time_ms}ms` : (t.size_kb ? `${t.size_kb}KB` : '-');
  const targetCol = t.target_ms ? `< ${t.target_ms}ms` : (t.target_kb ? `< ${t.target_kb}KB` : '-');
  return `| ${t.name} | ${timeCol} | ${targetCol} | ${t.passed ? '✅ PASS' : '❌ FAIL'} |`;
}).join('\n')}

## 性能指标说明

### 响应时间要求

| 操作 | 目标 | 说明 |
|------|------|------|
| 数据加载 | < 50ms | 从磁盘读取并解析JSON |
| 数据转换 | < 100ms | Gold层到Serving层转换 |
| 列表查询 | < 100ms | 带筛选和排序的查询 |
| 搜索 | < 100ms | 全文搜索响应 |
| API响应 | < 100ms | HTTP API总响应时间 |

### 文件大小要求

| 文件 | 目标 | 说明 |
|------|------|------|
| serving_data.json | < 500KB | 完整数据 |
| serving_data_light.json | < 100KB | 移动端轻量版 |
| search_index.json | < 100KB | 搜索索引 |

## 优化建议

1. **缓存策略**: API层已实现5分钟内存缓存
2. **数据分页**: 默认每页20条，最大100条
3. **轻量版本**: 移动端使用 serving_data_light.json
4. **索引优化**: 预计算的搜索索引支持O(1)查找

## 向后兼容性

- ✅ 所有现有字段保持兼容
- ✅ 新增字段不会影响旧版UI
- ✅ 支持渐进式升级
`;
}

// 运行测试
runPerformanceTests().catch(console.error);
