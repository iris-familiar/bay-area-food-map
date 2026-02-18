import { test, expect } from '@playwright/test';

test.describe('03 - Web UI Rendering (Smoke)', () => {
  
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
    
    // 验证标题
    await expect(page).toHaveTitle(/湾区美食地图/);
    
    // 验证页面内容加载
    const content = await page.content();
    expect(content).toContain('餐厅');
  });

  test('restaurant cards are visible', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });
    await page.waitForSelector('.restaurant-card', { timeout: 5000 });
    
    const cards = page.locator('.restaurant-card');
    const count = await cards.count();
    console.log(`✓ 找到 ${count} 个餐厅卡片`);
    expect(count).toBeGreaterThan(0);
  });

  test('detail modal opens', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });
    await page.waitForSelector('.restaurant-card', { timeout: 5000 });
    
    // 点击第一个卡片
    await page.locator('.restaurant-card').first().click();
    
    // 等待 modal
    await page.waitForSelector('#detail-modal.active', { timeout: 5000 });
    
    // 验证 modal 内容
    await expect(page.locator('#modal-content')).toBeVisible();
  });

  test('chart renders in modal', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });
    await page.waitForSelector('.restaurant-card', { timeout: 5000 });
    
    await page.locator('.restaurant-card').first().click();
    await page.waitForSelector('#detail-modal.active', { timeout: 5000 });
    
    // 验证 SVG 图表存在
    const svg = page.locator('#modal-content svg');
    await expect(svg).toBeVisible();
  });

  test('filters work', async ({ page }) => {
    await page.goto('/', { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
    
    // 验证筛选器存在
    await expect(page.locator('#cuisine-filter')).toBeVisible();
    await expect(page.locator('#region-filter')).toBeVisible();
    await expect(page.locator('#sort-filter')).toBeVisible();
  });
});
