# Export路径修复验证报告

## 问题分析

### 当前状态
| 项目 | 当前路径 | 目标路径 |
|------|----------|----------|
| 导出位置 | `src/data/serving_data.json` | `data/serving/serving_data.json` |
| 搜索索引 | `src/data/search_index.json` | `data/serving/search_index.json` |
| 统计数据 | `src/data/stats.json` | `data/serving/stats.json` |

### 代码中的路径配置

**export_to_serving.js (当前)**
```javascript
const CONFIG = {
  servingDataPath: path.join(__dirname, '../data/serving_data.json'),  // → src/data/
  searchIndexPath: path.join(__dirname, '../data/search_index.json'),
  statsPath: path.join(__dirname, '../data/stats.json'),
};
```

**index.js (生产入口)**
```javascript
const DATA_PATH = path.join(__dirname, 'data', 'serving', 'serving_data.json');
// 期望: data/serving/serving_data.json
```

**api.js (API服务)**
```javascript
const CONFIG = {
  dataPath: path.join(__dirname, '../data/serving_data.json'),  // → src/data/
};
```

---

## 验证内容

### 1. 修复是否足够? ✅

**结论: 是的，但需要修改多处路径配置**

需要修改的文件:
1. `src/api/export_to_serving.js` - 导出路径
2. `src/api/api.js` - API读取路径
3. `src/api/perf_test.js` - 性能测试路径

**推荐的新配置:**
```javascript
const CONFIG = {
  servingDataPath: path.join(__dirname, '../../data/serving/serving_data.json'),
  searchIndexPath: path.join(__dirname, '../../data/serving/search_index.json'),
  statsPath: path.join(__dirname, '../../data/serving/stats.json'),
  cachePath: path.join(__dirname, '../../data/serving/cache'),
  version: '3.0.0'
};
```

路径解析:
- `__dirname` = `/project/src/api/`
- `../` → `/project/src/`
- `../../` → `/project/`
- `../../data/serving/` → `/project/data/serving/` ✅

---

### 2. 是否需要验证目录存在? ✅

**结论: 是，现有代码已有目录创建逻辑，但需要确认目标目录**

现有代码的目录检查:
```javascript
async function writeServingData(servingData, stats, searchIndex) {
  // 确保目录存在
  const servingDir = path.dirname(CONFIG.servingDataPath);
  if (!fs.existsSync(servingDir)) {
    fs.mkdirSync(servingDir, { recursive: true });
  }
  ...
}
```

**验证结果:**
- ✅ `data/serving/` 目录已存在
- ✅ `fs.mkdirSync({ recursive: true })` 会自动创建父目录
- ✅ 不需要额外修改

---

### 3. 是否需要添加路径检查? ⚠️ 建议添加

**结论: 建议添加前置验证，提高错误可读性**

当前代码在 `writeServingData` 中检查目录，但建议添加导出前的路径验证:

```javascript
// 建议添加的配置验证
function validateConfig() {
  const paths = {
    goldData: CONFIG.goldDataPath,
    servingData: CONFIG.servingDataPath,
    searchIndex: CONFIG.searchIndexPath,
    stats: CONFIG.statsPath
  };
  
  console.log('[EXPORT] Configuration:');
  Object.entries(paths).forEach(([name, p]) => {
    console.log(`  ${name}: ${p}`);
  });
  
  // 验证Gold数据存在
  if (!fs.existsSync(CONFIG.goldDataPath)) {
    throw new Error(`Gold data not found: ${CONFIG.goldDataPath}`);
  }
  
  // 验证目标目录可写
  const servingDir = path.dirname(CONFIG.servingDataPath);
  try {
    fs.accessSync(path.dirname(servingDir), fs.constants.W_OK);
  } catch (e) {
    throw new Error(`Cannot write to serving directory: ${servingDir}`);
  }
}
```

---

### 4. 导出后前端如何正确读取?

**当前状态分析:**

| 读取方式 | 当前路径 | 说明 |
|----------|----------|------|
| index.html (直接fetch) | `data/current/restaurant_database.json` | 读取Gold层 |
| index.js (API服务) | `data/serving/serving_data.json` | 期望Serving层 |
| api.js | `src/data/serving_data.json` | 错误路径 |

**问题:**
- `index.html` 直接读取 Gold 层数据，未使用 Serving 层优化数据
- `index.js` 配置了正确的 Serving 层路径
- `api.js` 路径配置错误

**修复方案:**

**方案A: 统一使用API服务 (推荐)**
```javascript
// index.html 修改为调用API
const response = await fetch('/api/restaurants');
// 或使用正确的serving数据路径
const response = await fetch('data/serving/serving_data.json?v=' + Date.now());
```

**方案B: 前端直接读取Serving数据**
```javascript
// index.html
const response = await fetch('data/serving/serving_data_light.json?v=' + Date.now());
// 轻量版更适合前端直接加载
```

**完整的修复清单:**

1. **export_to_serving.js**
   ```javascript
   const CONFIG = {
     goldDataPath: path.join(__dirname, '../../data/current/restaurant_database.json'),
     servingDataPath: path.join(__dirname, '../../data/serving/serving_data.json'),
     searchIndexPath: path.join(__dirname, '../../data/serving/search_index.json'),
     statsPath: path.join(__dirname, '../../data/serving/stats.json'),
     cachePath: path.join(__dirname, '../../data/serving/cache'),
     version: '3.0.0'
   };
   ```

2. **api.js**
   ```javascript
   const CONFIG = {
     port: process.env.PORT || 3456,
     dataPath: path.join(__dirname, '../../data/serving/serving_data.json'),
     statsPath: path.join(__dirname, '../../data/serving/stats.json'),
     searchIndexPath: path.join(__dirname, '../../data/serving/search_index.json'),
     cacheDir: path.join(__dirname, '../../data/serving/cache'),
     cacheTTL: 5 * 60 * 1000,
     pageSize: 20
   };
   ```

3. **perf_test.js** (如果存在)
   - 同样修改路径为 `../../data/serving/`

4. **index.html** (可选优化)
   - 修改为读取 `data/serving/serving_data_light.json` 以获得更好的性能

---

## 总结

### 修复是否足够?
✅ **是**，但需要在3个文件中同步修改路径配置

### 需要验证目录存在?
✅ **是**，现有代码已包含 `mkdirSync({ recursive: true })`，足够安全

### 需要添加路径检查?
⚠️ **建议添加**，可以提高错误诊断能力

### 前端读取方案?
✅ **需要选择一种方案**:
- 方案A: 使用API服务 (`index.js`)
- 方案B: 前端直接读取 `data/serving/serving_data_light.json`

### 优先级建议
1. 🔴 **高**: 修复 `export_to_serving.js` 和 `api.js` 的路径
2. 🟡 **中**: 更新 `index.html` 读取正确的serving数据
3. 🟢 **低**: 添加额外的路径验证日志

### 测试步骤
1. 修改路径配置
2. 运行 `node src/api/export_to_serving.js`
3. 验证 `data/serving/serving_data.json` 已更新
4. 运行 `node index.js` 测试API服务
5. 验证前端页面正常加载
