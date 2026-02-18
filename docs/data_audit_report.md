# 数据真实性审计报告

**审计日期**: 2026-02-16  
**审计范围**: projects/bay-area-food-map/ 下所有数据文件  
**审计原则**: 真实数据保留，瞎编数据清除，估算数据标记

---

## 统计摘要

| 指标 | 数值 |
|------|------|
| 总餐厅数 | 49 |
| 真实Google验证 | 40家 |
| 待Google验证 | 9家 |
| 真实时间序列数据 | 11家 |
| 待时间序列数据 | 38家 |

---

## 问题发现

### 1. 虚假Google Place ID

发现 **1条** 包含 "placeholder" 的假数据：

| ID | 餐厅名 | 问题 |
|----|--------|------|
| r050 | 沸腾鱼 | `ChIJ_placeholder_feiyu` - 明显假ID |

### 2. 重复Google Place ID

发现 **3组** 重复的Place ID（多个餐厅共用同一个ID）：

| Place ID | 涉及餐厅 |
|----------|----------|
| `ChIJqSZ411THj4ARi6IlC4HNcbs` | r010 阿拉上海 (✅真实), r025 Chubby Cattle (❌重复), r051 上海餐馆 (❌重复) |
| `ChIJY1nuy3zJj4AR5oUkWDX1eRw` | r030 江南雅厨 (✅), r034 家常菜馆 (❌重复) |
| `ChIJK1UUIAC1j4ARjzCttTx11Rw` | r042 包子铺 (✅), r045 李与白 (❌重复) |

### 3. 缺失/可疑数据

| ID | 餐厅名 | 问题 | 处理 |
|----|--------|------|------|
| r003 | Aceking麻辣烫 | place_id: null, 但verified: partial | 重置为未验证 |
| r014 | Ushiya AYCE | place_id: null, rating: null | 保持未验证状态 |
| r040 | 云贵菜馆 | rating: null | 清除可疑place_id |

---

## 清理操作

### Google数据清理

```json
{
  "google_place_id": null,      // 清除假ID、重复ID
  "google_rating": null,        // 清除假评分
  "verified": false,            // 标记为未验证
  "verification_note": "待Google验证"
}
```

**清理记录**:
- r003 (Aceking麻辣烫): 清除假验证状态
- r014 (Ushiya AYCE): 保持未验证
- r025 (Chubby Cattle): 清除重复place_id
- r034 (家常菜馆): 清除重复place_id
- r040 (云贵菜馆): 清除可疑place_id
- r042 (包子铺): 清除重复place_id
- r045 (李与白): 清除重复place_id
- r050 (沸腾鱼): 清除placeholder place_id
- r051 (上海餐馆): 清除重复place_id

### 时间序列数据审计

- **direct_match**: 11家 (来自真实小红书帖子匹配)
- **pending**: 38家 (待重新爬取)
- **synthetic**: 0家 (已清除所有合成数据)

### Metrics数据审计

所有sentiment_analysis.confidence字段已检查:
- **high**: 来自真实多帖分析
- **medium**: 来自单帖或有限数据
- **low/pending**: 待补充数据

---

## 清理后数据状态

| 状态 | 数量 |
|------|------|
| ✅ 完整验证 (Google + 时间序列) | 11家 |
| ⚠️ Google验证但时间序列pending | 29家 |
| ❓ 待完全验证 | 9家 |

---

## 建议后续操作

### 高优先级
1. **重新验证待验证餐厅** (9家)
   - 使用Google Places API重新搜索
   - 确认真实地址和评分

2. **获取时间序列数据** (38家)
   - 重新运行小红书爬虫
   - 匹配真实帖子数据

### 中优先级
3. **坐标数据补全**
   - 9家待验证餐厅坐标设为null
   - 地图按钮在UI中自动禁用

4. **Sentiment分析增强**
   - 对medium/low confidence数据重新分析
   - 增加更多quote样本

---

## 数据文件变更

| 文件 | 变更 |
|------|------|
| `data/current/restaurant_database.json` | ✅ 已清理 - 版本 v4.1-audited |
| `data/archive/restaurant_database_v4.0_pre_audit_2026-02-16.json` | 📦 原版本已归档 |
| `data/raw/phase1a_search_results.json` | ✅ 无需修改 (原始爬取数据) |
| `data/raw/phase1b_new_restaurants.json` | ✅ 无需修改 (原始爬取数据) |
| `docs/data_audit_report.md` | 📝 本报告 |

---

## 验证脚本

快速验证当前数据状态：

```bash
# 统计验证状态
jq '{total: (.restaurants | length), verified: [.restaurants[] | select(.verified == true)] | length, unverified: [.restaurants[] | select(.verified == false)] | length}' data/current/restaurant_database.json

# 检查是否还有placeholder
jq '.restaurants[] | select(.google_place_id != null and (.google_place_id | contains("placeholder"))) | .id' data/current/restaurant_database.json

# 检查重复place_id
jq '.restaurants[] | select(.google_place_id != null) | .google_place_id' data/current/restaurant_database.json | sort | uniq -d
```

---

**审计完成时间**: 2026-02-16 09:35 PST  
**下次审计建议**: 在批量导入新数据后执行
