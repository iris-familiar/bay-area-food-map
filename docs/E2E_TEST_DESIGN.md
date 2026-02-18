# 🔄 湾区美食地图 - 端到端测试方案
## Data Pipeline → Web UI 全流程验证

---

## 📋 测试架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           E2E Test Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐│
│  │ Data Layer   │───▶│ Pipeline     │───▶│ Web UI       │───▶│ User       ││
│  │ Tests        │    │ Tests        │    │ Tests        │    │ Flow Tests ││
│  └──────────────┘    └──────────────┘    └──────────────┘    └────────────┘│
│                                                                              │
│  • Database integrity  • Script execution  • Rendering      • Critical     │
│  • Schema validation   • Data transforms   • Interactions   • user paths   │
│  • Backup/recovery     • Error handling    • Performance    • Edge cases   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 测试目标

| 层级 | 目标 | 关键检查点 |
|------|------|-----------|
| **数据层** | 数据库完整性 | 字段完整、格式正确、无重复 |
| **管道层** | 脚本可靠性 | 执行成功、事务保护、可回滚 |
| **UI 层** | 渲染准确性 | 数据匹配、交互正常、样式一致 |
| **流程层** | 用户体验 | 关键路径通畅、性能达标 |

---

## 📁 测试文件结构

```
projects/bay-area-food-map/
├── tests/
│   ├── e2e/
│   │   ├── fixtures/
│   │   │   ├── database.ts          # 数据库辅助函数
│   │   │   ├── pipeline.ts          # 管道执行辅助
│   │   │   └── pages/
│   │   │       ├── HomePage.ts      # 首页页面对象
│   │   │       ├── DetailModal.ts   # 详情弹窗对象
│   │   │       └── FilterPanel.ts   # 筛选面板对象
│   │   ├── specs/
│   │   │   ├── 01-data-integrity.spec.ts      # 数据完整性测试
│   │   │   ├── 02-pipeline-execution.spec.ts  # 管道执行测试
│   │   │   ├── 03-web-rendering.spec.ts       # Web 渲染测试
│   │   │   ├── 04-user-flows.spec.ts          # 用户流程测试
│   │   │   └── 05-performance.spec.ts         # 性能测试
│   │   └── utils/
│   │       ├── test-data.ts         # 测试数据生成
│   │       └── assertions.ts        # 自定义断言
│   └── playwright.config.ts         # Playwright 配置
```

---

## 🔍 详细测试内容

### 1️⃣ 数据完整性测试 (`01-data-integrity.spec.ts`)

```typescript
test.describe('Database Integrity', () => {
  
  test('restaurant database schema is valid', async () => {
    // 检查必需字段
    // - name, xiaohongshu_id, region, city
    // - engagement, sentiment_score
    // - post_details 数组结构
  });

  test('no duplicate restaurants exist', async () => {
    // 基于 name + city 检查重复
    // 基于 xiaohongshu_id 检查重复
  });

  test('all post_details have valid engagement', async () => {
    // engagement > 0
    // date 格式正确
    // post_id 不为空
  });

  test('merged restaurants have correct flags', async () => {
    // merged_to 指向存在的餐厅
    // is_active = false
    // 有合并原因说明
  });

  test('google_places data format is valid', async () => {
    // place_id, rating, user_ratings_total
    // formatted_address 不为空
  });

  test('corrections.json syntax is valid', async () => {
    // JSON 可解析
    // 所有 correction_type 有效
  });

  test('quality_rules.json is valid', async () => {
    // 规则结构正确
    // 阈值范围合理
  });
});
```

**检查内容**:
- ✅ 数据库 JSON 格式有效
- ✅ 必填字段齐全
- ✅ 数据类型正确（数字、字符串、数组）
- ✅ 无重复餐厅（基于名称+城市）
- ✅ merged 标记正确
- ✅ 配置文件语法正确

---

### 2️⃣ 管道执行测试 (`02-pipeline-execution.spec.ts`)

```typescript
test.describe('Pipeline Execution', () => {
  
  test('transaction.js rollback works', async () => {
    // 创建测试数据
    // 开始事务
    // 修改数据
    // 执行 rollback
    // 验证数据恢复原状
  });

  test('apply_corrections.js executes successfully', async () => {
    // 备份当前数据
    // 添加测试 correction
    // 执行脚本
    // 验证修正已应用
    // 验证事务备份存在
  });

  test('auto_quality_fix.js runs without errors', async () => {
    // 运行脚本
    // 检查日志无错误
    // 验证输出报告生成
  });

  test('daily_master_job.sh completes successfully', async () => {
    // 模拟 cron 环境
    // 执行脚本
    // 检查所有子脚本返回码为 0
    // 验证日志文件更新
  });

  test('database symlink is correct', async () => {
    // 验证 restaurant_database.json 是 symlink
    // 指向正确的版本文件
  });

  test('backup directory structure is valid', async () => {
    // backup/ 目录存在
    // transactions/ 子目录存在
    // 有权限写入
  });
});
```

**检查内容**:
- ✅ 事务保护机制工作正常（begin/commit/rollback）
- ✅ 数据修正脚本执行无误
- ✅ 质量修复脚本运行正常
- ✅ 每日任务脚本完成成功
- ✅ 数据库符号链接正确
- ✅ 备份目录可写

---

### 3️⃣ Web 渲染测试 (`03-web-rendering.spec.ts`)

```typescript
test.describe('Web UI Rendering', () => {
  
  test('homepage loads with restaurant cards', async ({ page }) => {
    // 页面加载成功
    // 显示餐厅卡片（数量 > 0）
    // 卡片包含必需元素：名称、评分、地区
  });

  test('restaurant card displays correct data', async ({ page }) => {
    // 随机选取一个餐厅
    // 验证卡片显示的名称与数据库一致
    // 验证评分计算正确
    // 验证地区标签正确
  });

  test('filter functionality works', async ({ page }) => {
    // 筛选 cuisine
    // 验证结果数量变化
    // 验证所有结果符合筛选条件
    
    // 筛选 region
    // 组合筛选
    // 重置按钮工作
  });

  test('sort functionality works', async ({ page }) => {
    // 按讨论度排序
    // 按评分排序
    // 验证排序顺序正确
  });

  test('detail modal opens with correct data', async ({ page }) => {
    // 点击卡片
    // Modal 弹出
    // 验证所有字段与数据库匹配
    // - 名称、地址、电话
    // - 讨论度、口碑、Google评分
    // - 推荐菜品列表
    // - 月度讨论度图表
  });

  test('monthly engagement chart renders correctly', async ({ page }) => {
    // Modal 中的图表存在
    // SVG 元素正确渲染
    // 数据点数量 = 24
    // X 轴标签显示正确（1月显示年份）
  });

  test('xiaohongshu links are valid', async ({ page }) => {
    // 帖子链接格式正确
    // 链接可点击
    // 链接指向 xiaohongshu.com
  });

  test('google maps link works', async ({ page }) => {
    // Google Maps 按钮存在
    // 链接格式正确
  });

  test('pagination or lazy load works', async ({ page }) => {
    // 初始显示合理数量
    // 滚动加载更多（如有）
  });
});
```

**检查内容**:
- ✅ 页面正确加载并显示数据
- ✅ 餐厅卡片数据与数据库一致
- ✅ 筛选/排序功能工作正常
- ✅ 详情弹窗数据准确
- ✅ 月度讨论度图表渲染正确（24个点、X轴标签正确）
- ✅ 外部链接格式正确

---

### 4️⃣ 用户流程测试 (`04-user-flows.spec.ts`)

```typescript
test.describe('Critical User Flows', () => {
  
  test('user can find and view restaurant details', async ({ page }) => {
    // 打开首页
    // 使用筛选找到特定餐厅
    // 点击卡片打开详情
    // 查看月度图表
    // 点击小红书链接
    // 返回并关闭 modal
  });

  test('user can filter and sort combination', async ({ page }) => {
    // 选择 cuisine = 川菜
    // 选择 region = South Bay
    // 排序 = 讨论度
    // 验证结果正确
  });

  test('user can search through filtered results', async () => {
    // 筛选后输入搜索词
    // 验证实时过滤工作
  });

  test('mobile responsive layout works', async ({ page }) => {
    // 模拟 iPhone 尺寸
    // 验证卡片布局正确
    // Modal 全屏显示
    // 筛选器可访问
  });

  test('error handling for invalid restaurant id', async ({ page }) => {
    // 访问不存在的餐厅详情
    // 验证优雅的错误显示
  });
});
```

**检查内容**:
- ✅ 完整的用户发现流程通畅
- ✅ 组合筛选逻辑正确
- ✅ 移动端响应式正常
- ✅ 错误情况优雅处理

---

### 5️⃣ 性能测试 (`05-performance.spec.ts`)

```typescript
test.describe('Performance', () => {
  
  test('homepage loads within 3 seconds', async ({ page }) => {
    // 测量加载时间
    // LCP < 3s
    // FCP < 1.5s
  });

  test('filter response time is acceptable', async ({ page }) => {
    // 应用筛选
    // 测量响应时间 < 500ms
  });

  test('modal opens within 500ms', async ({ page }) => {
    // 点击卡片
    // 测量 modal 出现时间
  });

  test('database JSON size is reasonable', async () => {
    // 验证 database < 1MB
    // 加载时间在可接受范围
  });

  test('no memory leaks on repeated filtering', async ({ page }) => {
    // 重复筛选 50 次
    // 检查内存使用稳定
  });
});
```

**检查内容**:
- ✅ 页面加载时间 < 3秒
- ✅ 筛选响应 < 500ms
- ✅ Modal 打开 < 500ms
- ✅ 数据库文件大小合理

---

## 🛠️ 实现步骤

### Step 1: 初始化 Playwright

```bash
cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map
npm init playwright@latest
# 选择: TypeScript, tests 目录, 添加 GitHub Actions
```

### Step 2: 创建测试配置文件

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],

  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Step 3: 创建页面对象

```typescript
// tests/e2e/fixtures/pages/HomePage.ts
import { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly restaurantCards: Locator;
  readonly cuisineFilter: Locator;
  readonly regionFilter: Locator;
  readonly sortFilter: Locator;
  readonly resetButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.restaurantCards = page.locator('.restaurant-card');
    this.cuisineFilter = page.locator('#cuisine-filter');
    this.regionFilter = page.locator('#region-filter');
    this.sortFilter = page.locator('#sort-filter');
    this.resetButton = page.locator('#reset-filters');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async filterByCuisine(cuisine: string) {
    await this.cuisineFilter.selectOption(cuisine);
    await this.page.waitForTimeout(300); // 等待动画
  }

  async filterByRegion(region: string) {
    await this.regionFilter.selectOption(region);
    await this.page.waitForTimeout(300);
  }

  async getVisibleCards() {
    return this.restaurantCards.filter({ has: this.page.locator(':visible') });
  }

  async clickRestaurantCard(name: string) {
    await this.restaurantCards
      .filter({ hasText: name })
      .first()
      .click();
  }
}
```

### Step 4: 创建数据辅助函数

```typescript
// tests/e2e/fixtures/database.ts
import * as fs from 'fs';
import * as path from 'path';

export interface Restaurant {
  name: string;
  xiaohongshu_id: string;
  region: string;
  city: string;
  cuisine?: string;
  engagement: number;
  sentiment_score: number;
  google_places?: {
    rating: number;
    user_ratings_total: number;
  };
  post_details: Array<{
    post_id: string;
    date: string;
    engagement: number;
  }>;
  is_active?: boolean;
  merged_to?: string;
}

export function loadDatabase(): Restaurant[] {
  const dbPath = path.join(__dirname, '../../data/current/restaurant_database.json');
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  return data.restaurants || [];
}

export function getActiveRestaurants(): Restaurant[] {
  return loadDatabase().filter(r => r.is_active !== false);
}

export function getRestaurantByName(name: string): Restaurant | undefined {
  return getActiveRestaurants().find(r => r.name === name);
}
```

### Step 5: 运行测试

```bash
# 安装依赖
npm install

# 安装浏览器
npx playwright install

# 运行所有测试
npx playwright test

# 运行特定测试
npx playwright test 01-data-integrity
npx playwright test --headed --debug

# 查看报告
npx playwright show-report
```

---

## 📊 预期输出示例

```
Running 25 tests using 4 workers

✓ 01-data-integrity.spec.ts (6 tests)
  ✓ restaurant database schema is valid
  ✓ no duplicate restaurants exist
  ✓ all post_details have valid engagement
  ✓ merged restaurants have correct flags
  ✓ google_places data format is valid
  ✓ corrections.json syntax is valid

✓ 02-pipeline-execution.spec.ts (6 tests)
  ✓ transaction.js rollback works
  ✓ apply_corrections.js executes successfully
  ✓ auto_quality_fix.js runs without errors
  ✓ daily_master_job.sh completes successfully
  ✓ database symlink is correct
  ✓ backup directory structure is valid

✓ 03-web-rendering.spec.ts (10 tests)
  ✓ homepage loads with restaurant cards
  ✓ restaurant card displays correct data
  ✓ filter functionality works
  ✓ sort functionality works
  ✓ detail modal opens with correct data
  ✓ monthly engagement chart renders correctly
  ✓ xiaohongshu links are valid
  ✓ google maps link works

✓ 04-user-flows.spec.ts (5 tests)
  ✓ user can find and view restaurant details
  ✓ user can filter and sort combination
  ✓ mobile responsive layout works
  ✓ error handling for invalid restaurant id

✓ 05-performance.spec.ts (5 tests)
  ✓ homepage loads within 3 seconds [2.1s]
  ✓ filter response time is acceptable [120ms]
  ✓ modal opens within 500ms [180ms]
  ✓ database JSON size is reasonable [420KB]

25 passed (23.4s)
```

---

## 🔄 CI/CD 集成

### GitHub Actions Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install Playwright
        run: npx playwright install --with-deps
        
      - name: Run E2E tests
        run: npx playwright test
        
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

---

## ✅ 验收标准

| 测试套件 | 通过率 | 执行时间 | 关键指标 |
|---------|--------|---------|---------|
| 数据完整性 | 100% | < 5s | 无 schema 错误 |
| 管道执行 | 100% | < 30s | 所有脚本成功 |
| Web 渲染 | 100% | < 60s | 数据一致性 100% |
| 用户流程 | 100% | < 30s | 关键路径通畅 |
| 性能 | 100% | < 30s | 加载 < 3s |

---

这套 E2E 测试将确保从数据管道到 Web UI 的全链路可靠性。需要我开始实现吗？
