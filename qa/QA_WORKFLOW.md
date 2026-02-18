# QA Workflow Agent Configuration
# 
# 使用方式:
# 1. 直接运行 ./scripts/qa-workflow.sh (本地脚本模式)
# 2. 或通过 OpenClaw Agent Spawn:
#    - Backend QA Agent: 验证数据完整性、真实性
#    - Frontend QA Agent: 验证UI功能、前后端连接
#    - QA Orchestrator: 协调两个Agent，生成最终报告

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    QA Orchestrator                          │
│                      (Master Agent)                         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
        spawn │                              │ spawn
               ▼                              ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│    Backend QA Agent      │      │    Frontend QA Agent     │
│    (Data Validator)      │◄────►│    (UI Tester)           │
│                          │compare│                          │
│ • Schema validation      │notes  │ • UI component tests     │
│ • Data integrity checks  │      │ • Data connection tests  │
│ • Cross-reference verify │      │ • Functionality tests    │
│ • Completeness audit     │      │ • Visual regression      │
└──────────────┬───────────┘      └──────────────┬───────────┘
               │                                 │
               └──────────────┬──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Compare Notes   │
                    │  Generate Report │
                    └──────────────────┘
```

## Agent 角色定义

### 1. Backend QA Agent (`qa-backend`)

**职责：**
- 验证数据文件JSON结构完整性
- 检查必填字段（id, name, cuisine, area等）
- 交叉验证v5_ui.json与主数据库一致性
- 统计验证状态（verified count, Google rating覆盖率）
- 检测数据漂移（data drift）

**输入：**
- `data/current/restaurant_database.json`
- `data/current/restaurant_database_v5_ui.json`
- `data/current/search_mapping.json`

**输出格式：**
```json
{
  "agent": "backend_qa",
  "status": "PASSED|FAILED|PASSED_WITH_WARNINGS",
  "checks": {
    "data_integrity": { "status": "...", "details": {} },
    "schema_validation": { "status": "...", "details": {} },
    "cross_reference": { "status": "...", "details": {} },
    "verification_status": { "status": "...", "details": {} }
  },
  "stats": {
    "total_restaurants": 84,
    "verified": 49,
    "with_google_rating": 49,
    "verification_rate": "58.3%"
  },
  "issues": []
}
```

**触发命令：**
```bash
# 本地模式
./scripts/qa-workflow.sh backend

# Agent模式（通过OpenClaw）
sessions_spawn({
  task: "Run backend QA validation...",
  agentId: "qa-backend"
})
```

---

### 2. Frontend QA Agent (`qa-frontend`)

**职责：**
- 验证HTML文件结构和必要元素
- 检查JavaScript关键函数存在
- 测试数据加载API（HTTP请求验证）
- 验证UI组件状态（过滤、搜索、渲染）
- 检测前后端数据连接是否正常

**输入：**
- `index.html`
- `http://localhost:8888/data/current/restaurant_database_v5_ui.json`

**输出格式：**
```json
{
  "agent": "frontend_qa",
  "status": "PASSED|FAILED|PASSED_WITH_WARNINGS",
  "checks": {
    "file_structure": { "status": "...", "details": {} },
    "data_loading": { 
      "status": "...", 
      "http_status": 200,
      "restaurant_count": 84
    },
    "html_structure": { "status": "...", "details": {} },
    "javascript_functions": { "status": "...", "details": {} }
  },
  "ui_components": {},
  "issues": []
}
```

**触发命令：**
```bash
# 本地模式
./scripts/qa-workflow.sh frontend

# Agent模式
sessions_spawn({
  task: "Run frontend QA validation...",
  agentId: "qa-frontend"
})
```

---

### 3. QA Orchestrator (`qa-orchestrator`)

**职责：**
1. 并行启动 Backend QA Agent 和 Frontend QA Agent
2. 收集两边的报告
3. **Compare Notes** - 交叉验证关键指标：
   - 后端统计的餐厅数 == 前端加载的餐厅数？
   - 后端验证状态与前端显示一致？
   - 数据完整性检查是否通过？
4. 如果发现问题，要求双方重新检查特定部分
5. 生成最终QA报告

**决策逻辑：**
```
IF backend.status == FAILED OR frontend.status == FAILED:
    overall_status = FAILED
    action = "Block deployment, require fixes"
    
ELSE IF backend.data_count != frontend.data_count:
    overall_status = FAILED  
    action = "Data mismatch detected, investigate"
    
ELSE IF backend.status == WARNING OR frontend.status == WARNING:
    overall_status = PASSED_WITH_WARNINGS
    action = "Review warnings, deployment optional"
    
ELSE:
    overall_status = PASSED
    action = "Approved for deployment"
```

**输出：**
```json
{
  "timestamp": "...",
  "overall_status": "PASSED|PASSED_WITH_WARNINGS|FAILED",
  "backend_status": "...",
  "frontend_status": "...",
  "data_consistency": {
    "match": true,
    "backend_count": 84,
    "frontend_count": 84
  },
  "recommendations": [
    "Ready for deployment",
    "or: Fix X before deployment"
  ]
}
```

---

## 执行流程

### 方式1: 本地脚本（快速验证）
```bash
cd projects/bay-area-food-map

# 完整QA流程
./scripts/qa-workflow.sh full

# 仅后端
./scripts/qa-workflow.sh backend

# 仅前端
./scripts/qa-workflow.sh frontend
```

### 方式2: Agent协作模式（深度验证）

由 Travis (主Agent) 协调执行：

```javascript
// Step 1: Spawn Backend QA Agent
const backendResult = await sessions_spawn({
  task: `Run comprehensive backend QA for bay-area-food-map:
    1. Validate data/current/restaurant_database.json schema
    2. Check data integrity (all records have id, name, cuisine, area)
    3. Cross-reference with v5_ui.json - identify data drift
    4. Report verification stats (verified count, Google rating coverage)
    5. Output JSON report to qa/reports/backend_qa_TIMESTAMP.json`,
  agentId: "planner",
  label: "qa-backend"
});

// Step 2: Spawn Frontend QA Agent  
const frontendResult = await sessions_spawn({
  task: `Run comprehensive frontend QA for bay-area-food-map:
    1. Verify index.html structure and required elements
    2. Test data loading from localhost:8888
    3. Check JavaScript functions (loadData, renderRestaurants, etc.)
    4. Verify UI components exist (filter chips, search, stats)
    5. Output JSON report to qa/reports/frontend_qa_TIMESTAMP.json`,
  agentId: "planner",
  label: "qa-frontend"
});

// Step 3: Compare Notes
const comparison = compareReports(backendResult, frontendResult);

// Step 4: Decision
if (comparison.overall_status === "FAILED") {
  // 通知用户问题所在
} else {
  // 部署批准
}
```

---

## 触发条件

### 自动触发（建议）
在以下情况下自动运行QA Workflow：

1. **数据更新后**
   - 新餐厅数据提取完成
   - Google验证完成
   - 数据库版本升级

2. **代码改动后**
   - index.html 修改
   - JavaScript功能变更
   - UI组件调整

3. **定时检查**
   - 每日凌晨2:00数据更新后自动QA

### 手动触发
```bash
# 用户明确请求
"Travis, 运行QA验证"
"Travis, 检查数据完整性"
"Travis, 验证前端功能"
```

---

## 报告存储

```
qa/
├── reports/
│   ├── backend_qa_20260216_143022.json
│   ├── frontend_qa_20260216_143025.json
│   ├── qa_summary_20260216_143030.md
│   └── ...
├── backend_qa_task.json      # 任务定义
└── frontend_qa_task.json     # 任务定义
```

---

## 集成到维护脚本

在 `maintain.sh` 中添加：

```bash
run_qa_validation() {
    log "Running QA Workflow..."
    ./scripts/qa-workflow.sh full
    
    if [ $? -eq 0 ]; then
        log "QA passed - safe to commit"
        return 0
    else
        error "QA failed - review reports before committing"
        return 1
    fi
}

# 在数据更新后自动调用
if [ "$1" == "qa" ] || [ "$QA_AUTO" == "true" ]; then
    run_qa_validation
fi
```
