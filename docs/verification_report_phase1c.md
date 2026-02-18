# Google Places 验证报告 - Phase 1C

**执行日期**: 2026-02-15
**任务**: 验证餐厅 r023-r049 的 Google Places 信息

## 验证状态摘要

| 状态 | 数量 | 餐厅ID |
|------|------|--------|
| 已验证 (有真实Place ID) | 2 | r024 (湘粤情), r025 (Chubby Cattle) |
| 需要验证 (Placeholder ID) | 11 | r023, r024(沸腾鱼), r025(上海餐馆), r026, r027, r029, r030, r032, r035, r036, r045, r046 |
| 需要验证 (无Place ID) | 16 | r025(上海餐馆), r028, r031, r033, r034, r037, r038, r039, r040, r041, r042, r043, r044, r047, r048, r049 |

**总计需要验证**: 27家餐厅

---

## 验证尝试

### API 状态
- ❌ **Google Places API**: 未启用
  - 错误: "Places API (New) has not been used in project before or it is disabled"
  - 项目ID: 483447442674
  - 启用链接: https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=483447442674

- ❌ **Brave Search API**: 未配置
  - 需要配置 `BRAVE_API_KEY` 环境变量

- ⚠️ **浏览器验证**: 部分可行但效率低下
  - 成功找到一些餐厅，但无法批量提取 Place ID

### 发现的匹配

#### r023: 重庆荣昌铺盖面
- **地址**: 10445 S De Anza Blvd, Cupertino, CA 95014
- **状态**: ❌ 未找到
- **发现**: 在 Google Maps 搜索该地址未发现名为"重庆荣昌铺盖面"的餐厅
- **附近餐厅**: Ox 9 Lanzhou Handpulled Noodles, Special Noodle Soup, DH Noodles & Grill 等
- **结论**: 可能已关闭、更名或地址不准确

---

## 建议行动

### 立即可执行
1. **启用 Google Places API**
   - 访问: https://console.cloud.google.com/apis/library/places.googleapis.com
   - 启用后重新运行验证脚本

2. **配置 Brave Search API** (可选)
   - 运行: `openclaw configure --section web`
   - 或设置环境变量: `BRAVE_API_KEY`

### 人工验证
以下餐厅需要人工确认：

| ID | 餐厅名 | 地址 | 问题 |
|----|--------|------|------|
| r023 | 重庆荣昌铺盖面 | 10445 S De Anza Blvd, Cupertino | 未找到匹配 |
| r024 | 沸腾鱼 | 3625 Thornton Ave, Fremont | Placeholder ID |
| r025 | 上海餐馆 | 6076 Mowry Ave, Fremont | 无 Place ID |
| r026 | 潮汕砂锅粥 | 6092 Mowry Ave, Newark | Placeholder ID |
| r027 | One Piece Lamian | 34125 Fremont Blvd, Fremont | Placeholder ID |
| r028 | 徽菜馆 | 46172 Warm Springs Blvd, Fremont | 无 Place ID |
| r029 | 万峦猪脚 | 1743 Jacklin Rd, Milpitas | Placeholder ID |
| r030 | 江南雅厨 | 272 Barber Ct, Milpitas | Placeholder ID |
| r031 | 山城私房菜 | 241 Barber Ct, Milpitas | 无 Place ID |
| r032 | 牛浪人 | 1795 N Milpitas Blvd, Milpitas | Placeholder ID |
| r033 | Yuan Bistro | 212 Barber Ct, Milpitas | 无 Place ID |
| r034 | 家常菜馆 | 220 Barber Ct, Milpitas | 无 Place ID |
| r035 | 花溪王 | 1040 Grant Rd, Mountain View | Placeholder ID |
| r036 | 包大人 | 209 Castro St, Mountain View | Placeholder ID |
| r037 | MTV川湘家常菜 | 190 Castro St, Mountain View | 无 Place ID |
| r038 | MTV泰餐小馆 | 223 Castro St, Mountain View | 无 Place ID |
| r039 | 新疆拉条子 | 235 Castro St, Mountain View | 无 Place ID |
| r040 | 云贵菜馆 | 187 Castro St, Mountain View | 无 Place ID |
| r041 | 湾区第一牛肉面 | 222 Castro St, Mountain View | 无 Place ID |
| r042 | 包子铺 | 1294 El Camino Real, Sunnyvale | 无 Place ID |
| r043 | 淮扬菜餐厅 | 1267 El Camino Real, Sunnyvale | 无 Place ID |
| r044 | 上海家常菜 | 1245 El Camino Real, Sunnyvale | 无 Place ID |
| r045 | 李与白 | 1251 E Calaveras Blvd, Milpitas | Placeholder ID |
| r046 | 汆悦麻辣烫 | 1212 S Mary Ave, Sunnyvale | Placeholder ID |
| r047 | Wakusei拉面 | 1318 El Camino Real, Sunnyvale | 无 Place ID |
| r048 | 蒸饭专门店 | 1295 El Camino Real, Sunnyvale | 无 Place ID |
| r049 | 黄鱼年糕 | 1258 El Camino Real, Sunnyvale | 无 Place ID |

---

## 数据备份

原始数据库已备份至:
- `data/current/restaurant_database_backup_20260215.json`

---

## 备注

- 数据库中存在重复ID (r024, r025)，需要清理
- 部分餐厅可能使用英文名在Google Maps上注册，需要搜索英文名
- 建议优先验证热门餐厅 (如 Chubby Cattle, Yuan Bistro 等)

---

**验证脚本**: `scripts/verify_google_places.js` (待Google API启用后可用)
