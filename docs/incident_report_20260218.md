# 数据质量事故报告与修复方案

## 事故概述

**发现时间**: 2026-02-18  
**发现者**: 用户（少爷）  
**严重性**: 高

### 问题描述
所有餐厅的 `engagement`（讨论度）字段值被错误地设置为 `total_engagement` 的 **2倍**。

**具体案例**:
- Jun Bistro: 4,366 → 错误显示为 8,732
- 留湘小聚: 4,241 → 错误显示为 8,482
- 影响范围: 全部 79 家餐厅

## 根本原因分析

### 问题源头
在 `safe_merge.js` 脚本中，合并餐厅数据时使用了错误的累加逻辑：

```javascript
// 累加互动数
if (incoming.engagement !== undefined) {
  const oldEng = existing.engagement || 0;
  const newEng = incoming.engagement || 0;
  merged.engagement = oldEng + newEng;  // ❌ 错误：直接累加
}
```

### 问题产生流程
1. 初始数据：`total_engagement = 4241`, `engagement` 未设置
2. `standardize_database.js` 设置：`engagement = total_engagement = 4241`
3. `safe_merge.js` 合并时：`engagement = 4241 + 4241 = 8482`
4. 结果：`engagement` (8482) 是正确值 (4241) 的 **2倍**

### 为什么会发生
1. **Pipeline 缺乏数据一致性验证**
2. **Merge 脚本没有从 source of truth 重新计算**
3. **没有严格的 QA 检查阻止错误数据发布**

## 修复措施

### 已执行的修复
1. ✅ 创建修复脚本 `fix_engagement_bug.js`
2. ✅ 从 `post_details` 重新计算所有 `engagement` 和 `total_engagement`
3. ✅ 修复了 79 家餐厅的数据
4. ✅ 创建了严格验证器 `strict_validator.js`

### 代码修复
修改 `safe_merge.js`，改为从 source of truth 重新计算：

```javascript
// 从 post_details 重新计算 engagement（避免累加错误）
if (merged.post_details && merged.post_details.length > 0) {
  const calculatedEngagement = merged.post_details.reduce(
    (sum, p) => sum + (p.engagement || 0), 0
  );
  merged.engagement = calculatedEngagement;
  merged.total_engagement = calculatedEngagement;
}
```

## 预防措施

### 1. 严格验证机制 (已完成)
创建 `strict_validator.js`，检查：
- `engagement === total_engagement`
- `post_details` 计算值一致性
- 异常值检测
- 重复餐厅检测

### 2. Pipeline 集成验证
在每个数据处理步骤后自动运行验证：

```bash
# 在每个关键步骤后
node scripts/strict_validator.js || exit 1
```

### 3. 多 Agent 交叉验证 (建议)
建议实施多 Agent 验证流程：

```
数据生成 Agent → 数据验证 Agent A → 数据验证 Agent B → 人工审核
                    ↓                      ↓
                 独立计算              独立计算
                    ↓                      ↓
                 结果比对              结果比对
                    ↘                  ↙
                       一致性检查
                          ↓
                      发布/拒绝
```

### 4. 数据血缘追踪
为每个字段记录：
- 来源系统/脚本
- 最后更新时间
- 计算方式
- 验证状态

## 经验教训

### 技术层面
1. **永远不要累加派生字段** - 应该从 source of truth 重新计算
2. **Pipeline 必须有验证关卡** - 每个阶段都要有质量检查
3. **可疑模式检测** - 如 "所有值都是2的倍数" 应该触发警报

### 流程层面
1. **用户反馈至关重要** - 这次问题是由用户发现的
2. **可视化验证不够** - 需要自动化的数值验证
3. **Pipeline 需要可审计** - 每个数据变更都应该可追踪

## 后续行动

### 立即执行
- [x] 修复当前数据
- [x] 修复 merge 脚本
- [x] 创建验证脚本

### 本周完成
- [ ] 在 CI/CD 中集成验证脚本
- [ ] 创建数据质量监控面板
- [ ] 编写完整的数据处理文档

### 长期改进
- [ ] 实施多 Agent 交叉验证
- [ ] 建立数据血缘追踪系统
- [ ] 定期自动数据质量报告

## 验证截图

修复后的网页显示：
- Jun Bistro: 4,366 ✅
- 留湘小聚: 4,241 ✅

所有数据已通过 `strict_validator.js` 验证。
