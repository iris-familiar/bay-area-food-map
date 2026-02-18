# 变更日志
## 湾区美食地图项目

---

## 2026-02-17 重大修复

### 🚨 问题: 文件关系断裂导致网站无法加载

**原因**: 创建新数据文件时没有维护 symlink 关系

**影响**: 
- 网站持续显示"正在加载"
- 数据更新不生效
- E2E 测试失效

**修复内容**:

1. **数据库文件标准化**
   - 修复字段: xiaohongshu_id, region, city, engagement, sentiment_score
   - 影响: 84 个餐厅
   - 文件: `data/current/restaurant_database_v5_standardized.json`

2. **更新 symlink**
   ```
   restaurant_database.json → restaurant_database_v5_standardized.json
   ```

3. **修复 HTML 路径**
   - 之前: `restaurant_database_v5_ui.json`
   - 之后: `restaurant_database.json`

4. **修复字段兼容性**
   - 添加 `r.city || r.area` 兼容逻辑
   - 添加 `regionValueMap` 筛选器映射

5. **修复配置文件**
   - corrections.json: 对象 → 数组
   - quality_rules.json: 添加 rules 包装

**新增保障机制**:
- `docs/DATA_RELATIONSHIP.md` - 文件关系文档
- `scripts/check_file_integrity.js` - 自动检查脚本
- `docs/E2E_TEST_DESIGN.md` - E2E 测试设计
- `scripts/e2e-smoke-test.js` - 轻量级验证

---

## 变更检查清单 (防止再犯)

### 创建新数据文件时必须:
- [ ] 阅读 `docs/DATA_RELATIONSHIP.md`
- [ ] 运行 `scripts/check_file_integrity.js`
- [ ] 更新 symlink
- [ ] 检查所有脚本引用
- [ ] 检查 HTML 中的硬编码路径
- [ ] 运行 E2E 测试验证

### 修改数据库字段时必须:
- [ ] 检查 HTML/JS 兼容性
- [ ] 添加向后兼容逻辑
- [ ] 更新测试文件
- [ ] 验证筛选器工作正常

---

## 文件命名规范

### 数据库文件
```
restaurant_database_v{N}_{DESCRIPTION}.json

示例:
- restaurant_database_v5_ui.json
- restaurant_database_v5_standardized.json
- restaurant_database_v6_cleaned.json
```

### Symlink (永远指向最新版本)
```
restaurant_database.json → restaurant_database_v{N}_{DESCRIPTION}.json
```

---

## 责任声明

**最后更新**: 2026-02-17  
**责任人**: Travis  
**审核状态**: 待少爷确认机制有效性

**承诺**: 
- 严格遵守变更检查清单
- 每次变更前运行完整性检查
- 维护 DATA_RELATIONSHIP.md 文档
- 及时更新此 CHANGELOG
