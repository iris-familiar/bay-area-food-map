# QA Workflow - Agent Usage Guide

## 在OpenClaw中使用QA工作流

### 方式1: 通过Travis直接触发

当Travis（主Agent）进行重大改动后，会自动运行QA：

```
用户: "Travis, 更新一下餐厅数据"
Travis: [执行数据更新]
       ↓
       [自动触发QA工作流]
       ↓
Travis: "数据更新完成！QA验证结果：✅ PASSED"
```

### 方式2: 用户明确要求QA

```
用户: "Travis, 运行QA验证"
Travis: 好的，启动QA工作流...
       
       [Backend QA Agent] 检测数据完整性...
       [Frontend QA Agent] 检测UI功能...
       [Compare Notes] 交叉验证...
       
       QA报告：
       - Backend: PASSED ✅
       - Frontend: PASSED_WITH_WARNINGS ⚠️
       - Overall: PASSED_WITH_WARNINGS
       
       建议：可以部署，但建议查看warnings
```

### 方式3: 部署前检查

```
用户: "Travis, 我想部署到生产环境"
Travis: 先运行部署前QA检查...
       
       [QA工作流运行中...]
       
       ❌ FAILED - 发现关键问题：
       - 数据不匹配：Backend 49家，Frontend 84家
       - 建议修复后再部署
```

## Agent Spawn配置

### Backend QA Agent Task

```javascript
sessions_spawn({
  task: `Run Backend QA validation for bay-area-food-map:
    
    DATA FILES TO CHECK:
    - data/current/restaurant_database.json
    - data/current/restaurant_database_v5_ui.json  
    - data/current/search_mapping.json
    
    CHECKS TO PERFORM:
    1. Data file existence - all required files present
    2. Schema validation - required fields (id, name, cuisine, area)
    3. Data integrity - no duplicate IDs, no missing critical fields
    4. Cross-reference - compare main db vs v5_ui, report data drift
    5. Verification status - verified count, Google rating coverage
    
    OUTPUT FORMAT (JSON):
    {
      "agent": "backend_qa",
      "status": "PASSED|FAILED|PASSED_WITH_WARNINGS",
      "checks": { ... },
      "stats": {
        "total_restaurants": N,
        "verified": N,
        "verification_rate": "X%"
      },
      "issues": []
    }
    
    Save report to: qa/reports/backend_qa_TIMESTAMP.json`,
  agentId: "planner",
  label: "qa-backend",
  runTimeoutSeconds: 120
});
```

### Frontend QA Agent Task

```javascript
sessions_spawn({
  task: `Run Frontend QA validation for bay-area-food-map:
    
    FILES TO CHECK:
    - index.html
    - data/current/restaurant_database_v5_ui.json (via HTTP)
    
    SERVER REQUIREMENT:
    - Must be running on http://localhost:8888
    
    CHECKS TO PERFORM:
    1. File structure - required files exist
    2. HTML structure - required elements present
       - restaurant-grid
       - search input
       - filter chips (cuisine)
       - stats display
    3. Data loading test - HTTP GET /data/current/restaurant_database_v5_ui.json
       - Should return 200 OK
       - Should return valid JSON
       - Report restaurant_count
    4. JavaScript functions - check for:
       - loadData
       - renderRestaurants
       - applyFilters
       - getSentimentScore
       - updateStats
       - showDetail
    
    OUTPUT FORMAT (JSON):
    {
      "agent": "frontend_qa",
      "status": "PASSED|FAILED|PASSED_WITH_WARNINGS",
      "checks": {
        "file_structure": {...},
        "html_structure": {...},
        "data_loading": {
          "status": "...",
          "http_status": 200,
          "restaurant_count": N
        },
        "javascript": {...}
      },
      "issues": []
    }
    
    Save report to: qa/reports/frontend_qa_TIMESTAMP.json`,
  agentId: "planner",
  label: "qa-frontend",
  runTimeoutSeconds: 120
});
```

### QA Orchestrator Task

```javascript
sessions_spawn({
  task: `Run complete QA Workflow for bay-area-food-map:
    
    STEP 1: Run Backend QA
    - Validate data integrity and schema
    - Check cross-references between data files
    - Report statistics
    
    STEP 2: Run Frontend QA
    - Validate UI components
    - Test data loading from localhost:8888
    - Check JavaScript functions
    
    STEP 3: Compare Notes
    - Cross-validate backend vs frontend data counts
    - Identify any mismatches
    - Aggregate issues from both agents
    
    STEP 4: Generate Verdict
    Determine overall_status:
    - PASSED: Both agents passed, data consistent
    - PASSED_WITH_WARNINGS: Minor issues but acceptable
    - FAILED: Critical issues or data mismatch
    
    OUTPUT:
    - Console summary
    - qa/reports/qa_summary_TIMESTAMP.md
    - qa/reports/qa_comparison_TIMESTAMP.json
    
    RETURN: overall_status and key recommendations`,
  agentId: "planner",
  label: "qa-orchestrator",
  runTimeoutSeconds: 180
});
```

## Compare Notes逻辑

### 数据一致性检查

```javascript
function compareNotes(backendResult, frontendResult) {
  const issues = [];
  
  // Critical: Data count must match
  if (backendResult.stats.total_restaurants !== 
      frontendResult.checks.data_loading.restaurant_count) {
    issues.push(`Data mismatch: Backend has ${backendResult.stats.total_restaurants}, ` +
                `Frontend loads ${frontendResult.checks.data_loading.restaurant_count}`);
    return { status: 'FAILED', issues };
  }
  
  // Check verification rate
  const verificationRate = parseFloat(backendResult.stats.verification_rate);
  if (verificationRate < 50) {
    issues.push(`Low verification rate: ${verificationRate}%`);
  }
  
  // Aggregate issues
  issues.push(...backendResult.issues, ...frontendResult.issues);
  
  // Determine status
  const hasFailures = backendResult.status === 'FAILED' || 
                      frontendResult.status === 'FAILED';
  const hasWarnings = backendResult.status.includes('WARNING') || 
                      frontendResult.status.includes('WARNING');
  
  return {
    status: hasFailures ? 'FAILED' : 
            (hasWarnings ? 'PASSED_WITH_WARNINGS' : 'PASSED'),
    issues,
    recommendations: generateRecommendations(issues)
  };
}
```

## 与CI/CD集成

### Git Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running QA Workflow..."
./qa.sh

if [ $? -ne 0 ]; then
    echo "❌ QA failed. Commit blocked."
    echo "Run './qa.sh report' to see details."
    exit 1
fi

echo "✅ QA passed. Proceeding with commit."
```

### GitHub Actions

```yaml
# .github/workflows/qa.yml
name: QA Validation

on: [push, pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install -g js-yaml
      - run: ./qa.sh
      - run: |
          if [ $? -ne 0 ]; then
            echo "::error::QA Validation Failed"
            cat qa/reports/qa_summary_*.md
            exit 1
          fi
```

## 扩展QA Agents

### 添加新检查项

1. 在 `qa/qa-orchestrator.js` 中添加新方法
2. 在 `run()` 中调用该方法
3. 更新 `agent-config.json` 中的 checks 列表

### 添加新的QA Agent

比如添加 **Performance QA Agent**：

```javascript
class PerformanceQAAgent {
  async run() {
    // 1. 测试页面加载时间
    // 2. 测试数据加载时间  
    // 3. 测试搜索响应时间
    // 4. 生成性能报告
  }
}
```

## 报告存储

所有报告按时间戳存储：

```
qa/reports/
├── backend_qa_2026-02-16T21-06-48.json
├── frontend_qa_2026-02-16T21-06-48.json
├── qa_comparison_2026-02-16T21-06-48.json
└── qa_summary_2026-02-16T21-06-48.md
```

保留最近30天的报告，自动清理旧报告。
