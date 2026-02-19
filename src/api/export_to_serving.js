/**
 * Export to Serving Layer
 * 从Gold层导出数据到Serving层，生成UI优化的数据格式
 * 
 * 功能：
 * 1. 读取Gold层数据 (restaurant_database_v5_ui.json)
 * 2. 预计算统计数据
 * 3. 生成UI优化的serving数据格式
 * 4. 生成搜索索引
 * 5. 写入Serving层
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  goldDataPath: path.join(__dirname, '../../data/current/restaurant_database.json'),
  servingDataPath: path.join(__dirname, '../../data/serving/serving_data.json'),
  searchIndexPath: path.join(__dirname, '../../data/serving/search_index.json'),
  statsPath: path.join(__dirname, '../../data/serving/stats.json'),
  cachePath: path.join(__dirname, '../cache'),
  version: '3.0.0'
};

/**
 * 主导出函数
 */
async function exportToServing() {
  console.log('[EXPORT] Starting export from Gold to Serving layer...');
  const startTime = Date.now();

  try {
    // 1. 读取Gold层数据
    console.log('[EXPORT] Loading Gold layer data...');
    const goldData = await loadGoldData();
    
    // 2. 转换数据为Serving格式
    console.log('[EXPORT] Transforming to serving format...');
    const servingData = transformToServing(goldData);
    
    // 3. 预计算统计数据
    console.log('[EXPORT] Computing statistics...');
    const stats = computeStats(servingData);
    
    // 4. 生成搜索索引
    console.log('[EXPORT] Building search index...');
    const searchIndex = buildSearchIndex(servingData);
    
    // 5. 写入Serving层
    console.log('[EXPORT] Writing to serving layer...');
    await writeServingData(servingData, stats, searchIndex);
    
    const duration = Date.now() - startTime;
    console.log(`[EXPORT] Completed in ${duration}ms`);
    console.log(`[EXPORT] Exported ${servingData.restaurants.length} restaurants`);
    
    return {
      success: true,
      duration,
      stats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[EXPORT] Error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 加载Gold层数据
 */
async function loadGoldData() {
  if (!fs.existsSync(CONFIG.goldDataPath)) {
    throw new Error(`Gold data not found: ${CONFIG.goldDataPath}`);
  }
  
  const content = fs.readFileSync(CONFIG.goldDataPath, 'utf-8');
  const data = JSON.parse(content);
  
  return {
    version: data.version || '1.0',
    updated_at: data.updated_at || new Date().toISOString(),
    total_restaurants: data.total_restaurants || 0,
    restaurants: data.restaurants || []
  };
}

/**
 * 转换为Serving层格式 (UI优化)
 */
function transformToServing(goldData) {
  const restaurants = goldData.restaurants
    .filter(r => !r._status || r._status !== 'duplicate_merged')
    .map(r => transformRestaurant(r));

  return {
    version: CONFIG.version,
    updated_at: new Date().toISOString(),
    total_count: restaurants.length,
    restaurants,
    metadata: {
      source_version: goldData.version,
      source_updated: goldData.updated_at,
      export_time: new Date().toISOString()
    }
  };
}

/**
 * 转换单个餐厅数据
 */
function transformRestaurant(r) {
  // 向后兼容：确保UI需要的字段都存在
  const transformed = {
    // 核心标识
    id: r.id,
    xiaohongshu_id: r.xiaohongshu_id || r.id,
    
    // 基本信息
    name: r.name,
    name_en: r.name_en || r.nameEn || '',
    cuisine: r.cuisine || '未知',
    
    // 地理位置 (向后兼容 + 新增)
    area: r.area || r.city || '未知',
    city: r.city || r.area || '未知',
    region: r.region || inferRegion(r.area || r.city),
    address: r.address || '',
    
    // 评分和指标 (UI展示用)
    engagement: r.engagement || r.total_engagement || 0,
    sentiment_score: r.sentiment_score || 0,
    google_rating: r.google_rating || null,
    
    // 统计数据
    mention_count: r.mention_count || 0,
    total_engagement: r.total_engagement || r.engagement || 0,
    
    // 推荐菜品
    recommendations: r.recommendations || [],
    recommendations_source: r.recommendations_source || 'extracted',
    
    // 帖子详情 (限制数量以优化性能)
    post_details: (r.post_details || []).slice(0, 5).map(p => ({
      post_id: p.post_id,
      title: p.title || '无标题',
      date: p.date,
      engagement: p.engagement || 0,
      context: p.context || ''
    })),
    
    // 情感分析详情
    sentiment_details: r.sentiment_details || {
      positive_mentions: 0,
      negative_mentions: 0,
      analyzed_contexts: 0
    },
    sentiment_confidence: r.sentiment_confidence || 'low',
    
    // 语义标签
    semantic_tags: r.semantic_tags || {
      scenes: [],
      vibes: [],
      practical: []
    },
    
    // Google信息
    google_place_id: r.google_place_id || null,
    verified: r.verified || false,
    
    // 趋势
    trend_30d: r.trend_30d || 0,
    
    // 时间序列 (用于图表)
    timeseries: buildTimeseries(r.post_details),
    
    // UI展示优化字段
    ui_display: {
      engagement_formatted: formatEngagement(r.engagement || r.total_engagement || 0),
      sentiment_percentage: r.sentiment_score ? Math.round(r.sentiment_score * 100) : null,
      sentiment_color: getSentimentColor(r.sentiment_score),
      google_rating_color: getGoogleRatingColor(r.google_rating),
      region_label: getRegionLabel(r.region || inferRegion(r.area || r.city)),
      cuisine_icon: getCuisineIcon(r.cuisine),
      top_tags: generateTopTags(r)
    },
    
    // 合并信息
    merge_info: r.merge_info || null,
    
    // 更新时间
    updated_at: r.updated_at || new Date().toISOString()
  };

  return transformed;
}

/**
 * 构建时间序列数据
 */
function buildTimeseries(postDetails) {
  if (!postDetails || postDetails.length === 0) {
    return { monthly: [], last_6m: [] };
  }

  // 按月份聚合
  const monthly = {};
  const now = new Date();
  
  // 初始化最近24个月
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = 0;
  }

  // 聚合数据
  postDetails.forEach(p => {
    if (p.date) {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthly[key] !== undefined) {
        monthly[key] += p.engagement || 0;
      }
    }
  });

  const monthlyData = Object.entries(monthly)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ month, value }));

  // 最近6个月
  const last6m = monthlyData.slice(-6);

  return { monthly: monthlyData, last_6m: last6m };
}

/**
 * 计算统计数据
 */
function computeStats(servingData) {
  const restaurants = servingData.restaurants;
  
  // 基础统计
  const total = restaurants.length;
  const withGoogleRating = restaurants.filter(r => r.google_rating).length;
  const withSentiment = restaurants.filter(r => r.sentiment_score > 0).length;
  const withAddress = restaurants.filter(r => r.address).length;
  
  // 区域分布
  const regionDistribution = restaurants.reduce((acc, r) => {
    const region = r.region || 'Unknown';
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {});
  
  // 菜系分布
  const cuisineDistribution = restaurants.reduce((acc, r) => {
    const cuisine = r.cuisine || '未知';
    acc[cuisine] = (acc[cuisine] || 0) + 1;
    return acc;
  }, {});
  
  // 评分分布
  const engagementRanges = {
    'high': restaurants.filter(r => r.engagement >= 5000).length,
    'medium': restaurants.filter(r => r.engagement >= 1000 && r.engagement < 5000).length,
    'low': restaurants.filter(r => r.engagement < 1000).length
  };
  
  // 标签统计
  const tagStats = {};
  restaurants.forEach(r => {
    const tags = r.semantic_tags || {};
    [...(tags.scenes || []), ...(tags.vibes || []), ...(tags.practical || [])].forEach(tag => {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
    });
  });
  
  // 热门推荐菜品
  const dishMentions = {};
  restaurants.forEach(r => {
    (r.recommendations || []).forEach(dish => {
      dishMentions[dish] = (dishMentions[dish] || 0) + 1;
    });
  });
  const topDishes = Object.entries(dishMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([dish, count]) => ({ dish, count }));

  return {
    total_restaurants: total,
    quality_metrics: {
      with_google_rating: withGoogleRating,
      with_google_rating_pct: Math.round((withGoogleRating / total) * 100),
      with_sentiment: withSentiment,
      with_sentiment_pct: Math.round((withSentiment / total) * 100),
      with_address: withAddress,
      with_address_pct: Math.round((withAddress / total) * 100)
    },
    region_distribution: regionDistribution,
    cuisine_distribution: cuisineDistribution,
    engagement_distribution: engagementRanges,
    top_tags: Object.entries(tagStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count })),
    top_dishes: topDishes,
    avg_engagement: Math.round(restaurants.reduce((sum, r) => sum + r.engagement, 0) / total),
    avg_sentiment: restaurants.filter(r => r.sentiment_score > 0).length > 0
      ? restaurants.filter(r => r.sentiment_score > 0).reduce((sum, r) => sum + r.sentiment_score, 0) / restaurants.filter(r => r.sentiment_score > 0).length
      : 0,
    computed_at: new Date().toISOString()
  };
}

/**
 * 构建搜索索引
 */
function buildSearchIndex(servingData) {
  const index = {
    by_name: {},
    by_cuisine: {},
    by_region: {},
    by_dish: {},
    by_tag: {},
    search_terms: {}
  };

  servingData.restaurants.forEach(r => {
    // 名称索引
    const nameLower = r.name.toLowerCase();
    addToIndex(index.by_name, nameLower, r.id);
    
    // 分词索引名称
    nameLower.split(/\s+/).forEach(term => {
      if (term.length >= 2) {
        addToIndex(index.search_terms, term, r.id);
      }
    });
    
    // 菜系索引
    if (r.cuisine) {
      addToIndex(index.by_cuisine, r.cuisine, r.id);
    }
    
    // 区域索引
    if (r.region) {
      addToIndex(index.by_region, r.region, r.id);
    }
    if (r.area) {
      addToIndex(index.by_region, r.area, r.id);
    }
    if (r.city) {
      addToIndex(index.by_region, r.city, r.id);
    }
    
    // 菜品索引
    (r.recommendations || []).forEach(dish => {
      addToIndex(index.by_dish, dish, r.id);
      // 菜品关键词
      dish.toLowerCase().split(/\s+/).forEach(term => {
        if (term.length >= 2) {
          addToIndex(index.search_terms, term, r.id);
        }
      });
    });
    
    // 标签索引
    const tags = r.semantic_tags || {};
    [...(tags.scenes || []), ...(tags.vibes || []), ...(tags.practical || [])].forEach(tag => {
      addToIndex(index.by_tag, tag, r.id);
    });
  });

  return index;
}

function addToIndex(indexObj, key, restaurantId) {
  if (!indexObj[key]) {
    indexObj[key] = [];
  }
  if (!indexObj[key].includes(restaurantId)) {
    indexObj[key].push(restaurantId);
  }
}

/**
 * 写入Serving层
 */
async function writeServingData(servingData, stats, searchIndex) {
  // 确保目录存在
  const servingDir = path.dirname(CONFIG.servingDataPath);
  if (!fs.existsSync(servingDir)) {
    fs.mkdirSync(servingDir, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.cachePath)) {
    fs.mkdirSync(CONFIG.cachePath, { recursive: true });
  }
  
  // 写入主数据
  fs.writeFileSync(CONFIG.servingDataPath, JSON.stringify(servingData, null, 2));
  
  // 写入统计
  fs.writeFileSync(CONFIG.statsPath, JSON.stringify(stats, null, 2));
  
  // 写入搜索索引
  fs.writeFileSync(CONFIG.searchIndexPath, JSON.stringify(searchIndex, null, 2));
  
  // 生成轻量级版本 (移动端优化)
  const lightData = {
    version: servingData.version,
    updated_at: servingData.updated_at,
    total_count: servingData.total_count,
    restaurants: servingData.restaurants.map(r => ({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      region: r.region,
      engagement: r.engagement,
      sentiment_score: r.sentiment_score,
      google_rating: r.google_rating,
      recommendations: r.recommendations.slice(0, 3),
      ui_display: r.ui_display
    }))
  };
  fs.writeFileSync(
    path.join(servingDir, 'serving_data_light.json'),
    JSON.stringify(lightData, null, 2)
  );
  
  console.log(`[EXPORT] Written to ${CONFIG.servingDataPath}`);
  console.log(`[EXPORT] Light version: ${path.join(servingDir, 'serving_data_light.json')}`);
}

// ==================== 工具函数 ====================

function inferRegion(area) {
  if (!area) return 'Unknown';
  const areaLower = area.toLowerCase();
  
  if (['cupertino', 'milpitas', 'san jose', 'santa clara', 'sunnyvale', 'mountain view', 'palo alto'].some(a => areaLower.includes(a))) {
    return 'South Bay';
  }
  if (['fremont', 'hayward', 'oakland', 'berkeley', 'newark', 'union city'].some(a => areaLower.includes(a))) {
    return 'East Bay';
  }
  if (['san mateo', 'burlingame', 'redwood city', 'daly city', 'foster city', 'belmont'].some(a => areaLower.includes(a))) {
    return 'Peninsula';
  }
  if (['san francisco', 'sf'].some(a => areaLower.includes(a))) {
    return 'San Francisco';
  }
  
  return 'Other';
}

function formatEngagement(value) {
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + 'w';
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'k';
  }
  return value.toString();
}

function getSentimentColor(score) {
  if (!score || score === 0) return 'gray';
  if (score >= 0.85) return 'green';
  if (score >= 0.7) return 'blue';
  return 'orange';
}

function getGoogleRatingColor(rating) {
  if (!rating) return 'gray';
  if (rating >= 4.5) return 'green';
  if (rating >= 4.0) return 'blue';
  if (rating >= 3.5) return 'orange';
  return 'red';
}

function getRegionLabel(region) {
  const labels = {
    'South Bay': '南湾',
    'East Bay': '东湾',
    'Peninsula': '半岛',
    'San Francisco': '旧金山',
    'Other': '其他'
  };
  return labels[region] || region;
}

function getCuisineIcon(cuisine) {
  const icons = {
    '川菜': '🌶️',
    '湘菜': '🌶️',
    '日料': '🍣',
    '韩餐': '🍲',
    '中餐': '🥢',
    '上海菜': '🥟',
    '融合菜': '🍽️',
    '西餐': '🍕',
    '火锅': '🍲',
    '烧烤': '🍖'
  };
  return icons[cuisine] || '🍴';
}

function generateTopTags(r) {
  const tags = [];
  
  // 添加高分标签
  if (r.sentiment_score >= 0.9) tags.push({ type: 'sentiment', label: '口碑极佳', color: 'green' });
  else if (r.sentiment_score >= 0.8) tags.push({ type: 'sentiment', label: '口碑不错', color: 'blue' });
  
  // 添加高讨论度标签
  if (r.engagement >= 10000) tags.push({ type: 'engagement', label: '热门', color: 'orange' });
  
  // 添加Google高分标签
  if (r.google_rating >= 4.5) tags.push({ type: 'rating', label: 'Google高分', color: 'green' });
  
  // 添加场景标签
  const scenes = (r.semantic_tags?.scenes || []).slice(0, 2);
  scenes.forEach(scene => {
    const sceneLabels = {
      'date-night': '约会',
      'group-dining': '聚餐',
      'family-friendly': '家庭',
      'quick-bite': '快餐',
      'fine-dining': '精致'
    };
    if (sceneLabels[scene]) {
      tags.push({ type: 'scene', label: sceneLabels[scene], color: 'gray' });
    }
  });
  
  return tags.slice(0, 4);
}

// ==================== CLI入口 ====================

if (require.main === module) {
  exportToServing().then(result => {
    if (result.success) {
      console.log('[EXPORT] ✅ Export successful');
      process.exit(0);
    } else {
      console.error('[EXPORT] ❌ Export failed:', result.error);
      process.exit(1);
    }
  });
}

module.exports = { exportToServing, transformToServing, computeStats, buildSearchIndex };
