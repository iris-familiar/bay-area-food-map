# 数据清理报告
**日期**: 2026-02-16
**任务**: 清除所有瞎编数据 (宁可放null，也不要瞎编数据)

## 执行摘要

### 清理结果
- ✅ **38家餐厅**的synthetic数据已被清除
- ✅ **11家餐厅**的真实数据已保留
- ✅ **0家**残留synthetic数据

### 数据质量检查
| 检查项 | 状态 | 说明 |
|--------|------|------|
| 没有synthetic标记的数据 | ✅ 通过 | 0残留 |
| 没有均匀分布的瞎编timeline | ✅ 通过 | 0残留 |
| null值正确处理 | ✅ 通过 | UI已更新 |
| UI正常显示（无undefined） | ✅ 通过 | 代码已修复 |

## 详细统计

### 数据源分布 (49家餐厅)
- **真实数据**: 11家 (22.4%)
  - 香锅大王, Kunjip Tofu, Mikiya, 留湘, 湘粤情, Chubby Cattle, 
  - One Piece Lamian, 牛浪人, Yuan Bistro, 包大人, MTV泰餐小馆
- **待获取数据**: 38家 (77.6%) - 已清除synthetic标记，设为pending状态

### 时间序列状态
- 空timeline: 38家 (等待数据获取)
- 有timeline: 11家
- null first_mentioned: 38家
- null trend_7d: 38家

## 修改内容

### 1. 数据库清理 (restaurant_database.json)
- 版本: 4.1-audited
- 将38家synthetic数据的time_series重置为:
  ```json
  {
    "timeline": [],
    "first_mentioned": null,
    "peak_discussion_date": null,
    "total_engagement": 保留真实值,
    "trend_7d": null,
    "trend_30d": null,
    "data_source": "pending",
    "matched_posts": 0
  }
  ```

### 2. UI更新 (index.html)
- `getTrend7d()` 和 `getTrend30d()` 现在返回null而不是0
- 卡片趋势badge只在trend7d !== null时显示
- Modal趋势指示器处理null值，显示"暂无趋势数据"
- 时间线部分：
  - 有数据时显示图表
  - 无数据(data_source === 'pending')时显示"数据待获取"提示
- 首次提及/讨论高峰显示"-"当值为null

### 3. 备份文件
- 原始数据已备份到: `data/archive/restaurant_database_timeseries_fixed_2026-02-16T1645.json`
- 清理后数据已备份到: `data/archive/restaurant_database_backup_2026-02-16T*.json`

## 关键原则贯彻

**宁可放null，也不要瞎编数据**

清理前:
- synthetic数据有瞎编的timeline（均匀分布的日期）
- matched_posts=0但timeline有数据
- UI显示虚假的趋势数据

清理后:
- synthetic数据全部转为pending状态
- timeline为空数组
- trend为null
- UI正确显示"暂无趋势数据"或"数据待获取"

## 后续建议

1. **重新获取数据**: 对于38家pending状态的餐厅，需要:
   - 调用小红书API获取真实的post详情
   - 提取publishTime
   - 重建timeline

2. **数据获取优先级**: 
   - 优先处理metrics.total_engagement高的餐厅
   - 优先处理verified的餐厅

3. **监控数据质量**:
   - 定期检查是否有新的synthetic数据产生
   - 验证timeline的日期分布是否合理

## 验证命令

```bash
# 检查是否还有synthetic数据
cd projects/bay-area-food-map
node -e "const db = JSON.parse(fs.readFileSync('data/current/restaurant_database.json')); 
console.log('synthetic残留:', db.restaurants.filter(r => r.time_series?.data_source === 'synthetic').length);"
```

---
**报告生成时间**: 2026-02-16T09:28 PST  
**执行者**: AI Assistant  
**状态**: ✅ 完成
