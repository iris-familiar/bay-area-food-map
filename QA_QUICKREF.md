# 🎯 QA Workflow 快速参考

## 一句话描述
> **每次重大改动后自动验证数据完整性和前后端一致性**

## 使用方式

```bash
./qa.sh              # 完整QA
./qa.sh backend      # 仅后端
./qa.sh frontend     # 仅前端
./qa.sh report       # 查看报告
```

## Agent协作流程

```
Travis (主Agent)
    ├── 触发条件：数据更新/代码改动/用户请求
    │
    ├──► Backend QA Agent ──┐
    │   • 数据完整性          │
    │   • Schema验证         │ Compare
    │   • 交叉验证           │ Notes
    │   • 统计指标           │
    │                       ▼
    ├──► Frontend QA Agent ─┘
        • UI组件检查
        • 数据连接测试
        • JS函数验证
                │
                ▼
        生成最终报告
        PASSED / FAILED
```

## 关键检查点

| 检查项 | 重要性 | 说明 |
|--------|--------|------|
| Data Consistency | ⭐⭐⭐ | 前后端数据数量必须一致 |
| Data Loading | ⭐⭐⭐ | 前端必须能加载数据 |
| Schema Validation | ⭐⭐ | 数据字段必须完整 |
| Verification Rate | ⭐⭐ | Google验证覆盖率 |

## 报告状态

- ✅ **PASSED** - 全部通过，可以部署
- ⚠️ **PASSED_WITH_WARNINGS** - 有警告但可部署  
- ❌ **FAILED** - 关键问题，需修复

## 触发时机

1. **自动触发**
   - 数据更新后
   - 代码改动后
   - 每日定时检查

2. **手动触发**
   - 用户: "Travis, 运行QA"
   - 部署前检查

## 文件位置

```
qa.sh                    # 快速入口
qa/
├── qa-orchestrator.js   # 主控脚本
├── README.md            # 详细文档
├── AGENT_USAGE.md       # Agent配置
└── reports/             # 报告存储
```

## 上次运行结果

查看: `./qa.sh report`
