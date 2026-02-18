/**
 * API Service for Bay Area Food Map
 * RESTful API with caching, filtering, and pagination
 * 
 * 端点：
 * GET /api/restaurants - 餐厅列表
 * GET /api/restaurants/:id - 单个餐厅详情
 * GET /api/search - 搜索
 * GET /api/stats - 统计数据
 * GET /api/filters - 可用筛选选项
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// 配置
const CONFIG = {
  port: process.env.PORT || 3456,
  dataPath: path.join(__dirname, '../data/serving_data.json'),
  statsPath: path.join(__dirname, '../data/stats.json'),
  searchIndexPath: path.join(__dirname, '../data/search_index.json'),
  cacheDir: path.join(__dirname, '../cache'),
  cacheTTL: 5 * 60 * 1000, // 5分钟缓存
  pageSize: 20
};

// 内存缓存
const memoryCache = new Map();
let servingData = null;
let searchIndex = null;
let stats = null;
let lastLoadTime = 0;

/**
 * 加载数据
 */
function loadData() {
  const now = Date.now();
  
  // 如果数据已加载且未过期，使用缓存
  if (servingData && (now - lastLoadTime) < CONFIG.cacheTTL) {
    return { servingData, searchIndex, stats };
  }
  
  try {
    // 加载Serving数据
    if (fs.existsSync(CONFIG.dataPath)) {
      const data = fs.readFileSync(CONFIG.dataPath, 'utf-8');
      servingData = JSON.parse(data);
    } else {
      throw new Error('Serving data not found. Run export_to_serving.js first.');
    }
    
    // 加载搜索索引
    if (fs.existsSync(CONFIG.searchIndexPath)) {
      const index = fs.readFileSync(CONFIG.searchIndexPath, 'utf-8');
      searchIndex = JSON.parse(index);
    }
    
    // 加载统计
    if (fs.existsSync(CONFIG.statsPath)) {
      const s = fs.readFileSync(CONFIG.statsPath, 'utf-8');
      stats = JSON.parse(s);
    }
    
    lastLoadTime = now;
    console.log(`[API] Data loaded at ${new Date().toISOString()}`);
    
    return { servingData, searchIndex, stats };
  } catch (error) {
    console.error('[API] Error loading data:', error.message);
    throw error;
  }
}

/**
 * 缓存键生成
 */
function generateCacheKey(reqPath, params) {
  const sortedParams = Object.keys(params || {})
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `${reqPath}?${sortedParams}`;
}

/**
 * 获取缓存
 */
function getCache(key) {
  const cached = memoryCache.get(key);
  if (cached && (Date.now() - cached.time) < CONFIG.cacheTTL) {
    return cached.data;
  }
  memoryCache.delete(key);
  return null;
}

/**
 * 设置缓存
 */
function setCache(key, data) {
  memoryCache.set(key, { data, time: Date.now() });
  
  // 清理过期缓存
  if (memoryCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if ((now - v.time) > CONFIG.cacheTTL) {
        memoryCache.delete(k);
      }
    }
  }
}

/**
 * 发送JSON响应
 */
function sendJSON(res, data, statusCode = 200) {
  const startTime = res.startTime || Date.now();
  const duration = Date.now() - startTime;
  
  const response = {
    success: statusCode < 400,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      response_time_ms: duration
    }
  };
  
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Response-Time': `${duration}ms`
  });
  res.end(JSON.stringify(response));
}

/**
 * 发送错误响应
 */
function sendError(res, message, statusCode = 500) {
  sendJSON(res, { error: message }, statusCode);
}

// ==================== API处理函数 ====================

/**
 * GET /api/restaurants - 餐厅列表
 * 支持: cuisine, region, sort, page, limit, min_engagement, min_rating
 */
function handleListRestaurants(req, res, params) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  const { servingData } = loadData();
  let restaurants = [...servingData.restaurants];
  
  // 筛选
  if (params.cuisine && params.cuisine !== 'all') {
    restaurants = restaurants.filter(r => r.cuisine === params.cuisine);
  }
  
  if (params.region && params.region !== 'all') {
    restaurants = restaurants.filter(r => r.region === params.region);
  }
  
  if (params.city && params.city !== 'all') {
    restaurants = restaurants.filter(r => r.city === params.city || r.area === params.city);
  }
  
  if (params.min_engagement) {
    const min = parseInt(params.min_engagement);
    restaurants = restaurants.filter(r => r.engagement >= min);
  }
  
  if (params.min_sentiment) {
    const min = parseFloat(params.min_sentiment);
    restaurants = restaurants.filter(r => r.sentiment_score >= min);
  }
  
  if (params.min_rating) {
    const min = parseFloat(params.min_rating);
    restaurants = restaurants.filter(r => (r.google_rating || 0) >= min);
  }
  
  if (params.tag) {
    restaurants = restaurants.filter(r => {
      const tags = r.semantic_tags || {};
      const allTags = [...(tags.scenes || []), ...(tags.vibes || []), ...(tags.practical || [])];
      return allTags.includes(params.tag);
    });
  }
  
  // 排序
  const sortField = params.sort || 'engagement';
  const sortOrder = params.order === 'asc' ? 1 : -1;
  
  restaurants.sort((a, b) => {
    let valA, valB;
    
    switch (sortField) {
      case 'engagement':
        valA = a.engagement || 0;
        valB = b.engagement || 0;
        break;
      case 'sentiment':
        valA = a.sentiment_score || 0;
        valB = b.sentiment_score || 0;
        break;
      case 'rating':
        valA = a.google_rating || 0;
        valB = b.google_rating || 0;
        break;
      case 'name':
        valA = a.name || '';
        valB = b.name || '';
        return sortOrder * valA.localeCompare(valB);
      case 'updated':
        valA = new Date(a.updated_at || 0).getTime();
        valB = new Date(b.updated_at || 0).getTime();
        break;
      default:
        valA = a.engagement || 0;
        valB = b.engagement || 0;
    }
    
    return sortOrder * (valB - valA);
  });
  
  // 分页
  const page = parseInt(params.page) || 1;
  const limit = Math.min(parseInt(params.limit) || CONFIG.pageSize, 100);
  const total = restaurants.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginatedRestaurants = restaurants.slice(start, end);
  
  // 轻量级响应
  const lightResponse = params.full !== 'true';
  const responseData = lightResponse 
    ? paginatedRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        region: r.region,
        city: r.city,
        engagement: r.engagement,
        sentiment_score: r.sentiment_score,
        google_rating: r.google_rating,
        recommendations: r.recommendations?.slice(0, 3) || [],
        ui_display: r.ui_display
      }))
    : paginatedRestaurants;
  
  return {
    restaurants: responseData,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    }
  };
}

/**
 * GET /api/restaurants/:id - 单个餐厅详情
 */
function handleGetRestaurant(req, res, id) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  const { servingData } = loadData();
  const restaurant = servingData.restaurants.find(r => r.id === id || r.xiaohongshu_id === id);
  
  if (!restaurant) {
    return { error: 'Restaurant not found', status: 404 };
  }
  
  // 查找相关餐厅 (同菜系或同区域)
  const related = servingData.restaurants
    .filter(r => r.id !== id && (r.cuisine === restaurant.cuisine || r.region === restaurant.region))
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      region: r.region,
      engagement: r.engagement,
      google_rating: r.google_rating,
      ui_display: r.ui_display
    }));
  
  return {
    restaurant,
    related
  };
}

/**
 * GET /api/search - 搜索
 */
function handleSearch(req, res, params) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  const query = (params.q || '').toLowerCase().trim();
  
  if (!query || query.length < 2) {
    return { error: 'Query too short (min 2 characters)', status: 400 };
  }
  
  const { servingData, searchIndex } = loadData();
  let results = [];
  let searchType = 'fuzzy';
  
  // 使用搜索索引
  if (searchIndex) {
    const matchedIds = new Set();
    
    // 1. 精确名称匹配
    if (searchIndex.by_name[query]) {
      searchIndex.by_name[query].forEach(id => matchedIds.add(id));
      searchType = 'exact_name';
    }
    
    // 2. 菜品匹配
    if (searchIndex.by_dish[query]) {
      searchIndex.by_dish[query].forEach(id => matchedIds.add(id));
    }
    
    // 3. 分词搜索
    const terms = query.split(/\s+/);
    terms.forEach(term => {
      if (searchIndex.search_terms[term]) {
        searchIndex.search_terms[term].forEach(id => matchedIds.add(id));
      }
      
      // 模糊匹配名称
      Object.keys(searchIndex.by_name).forEach(name => {
        if (name.includes(term)) {
          searchIndex.by_name[name].forEach(id => matchedIds.add(id));
        }
      });
    });
    
    results = servingData.restaurants.filter(r => matchedIds.has(r.id));
  }
  
  // 如果索引没有结果，使用模糊搜索
  if (results.length === 0) {
    results = servingData.restaurants.filter(r => {
      const nameMatch = r.name.toLowerCase().includes(query);
      const cuisineMatch = r.cuisine?.toLowerCase().includes(query);
      const cityMatch = r.city?.toLowerCase().includes(query);
      const areaMatch = r.area?.toLowerCase().includes(query);
      const dishMatch = r.recommendations?.some(d => d.toLowerCase().includes(query));
      return nameMatch || cuisineMatch || cityMatch || areaMatch || dishMatch;
    });
  }
  
  // 排序: 按相关度和讨论度
  results.sort((a, b) => {
    const aNameMatch = a.name.toLowerCase().includes(query);
    const bNameMatch = b.name.toLowerCase().includes(query);
    
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    
    return (b.engagement || 0) - (a.engagement || 0);
  });
  
  // 限制结果数
  const limit = Math.min(parseInt(params.limit) || 20, 50);
  
  return {
    query,
    search_type: searchType,
    total: results.length,
    restaurants: results.slice(0, limit).map(r => ({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      region: r.region,
      engagement: r.engagement,
      sentiment_score: r.sentiment_score,
      google_rating: r.google_rating,
      recommendations: r.recommendations?.slice(0, 3) || [],
      ui_display: r.ui_display
    }))
  };
}

/**
 * GET /api/stats - 统计数据
 */
function handleStats(req, res) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  const { stats, servingData } = loadData();
  
  return {
    stats,
    summary: {
      total_restaurants: servingData.total_count,
      version: servingData.version,
      updated_at: servingData.updated_at
    }
  };
}

/**
 * GET /api/filters - 可用筛选选项
 */
function handleFilters(req, res) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  const { servingData } = loadData();
  
  // 提取所有唯一值
  const cuisines = [...new Set(servingData.restaurants.map(r => r.cuisine).filter(Boolean))].sort();
  const regions = [...new Set(servingData.restaurants.map(r => r.region).filter(Boolean))].sort();
  const cities = [...new Set(servingData.restaurants.map(r => r.city || r.area).filter(Boolean))].sort();
  
  // 提取所有标签
  const allTags = new Set();
  servingData.restaurants.forEach(r => {
    const tags = r.semantic_tags || {};
    (tags.scenes || []).forEach(t => allTags.add(t));
    (tags.vibes || []).forEach(t => allTags.add(t));
    (tags.practical || []).forEach(t => allTags.add(t));
  });
  
  return {
    cuisines: cuisines.map(c => ({ value: c, label: c })),
    regions: regions.map(r => ({ 
      value: r, 
      label: getRegionLabel(r)
    })),
    cities: cities.map(c => ({ value: c, label: c })),
    tags: [...allTags].sort().map(t => ({ value: t, label: t })),
    sort_options: [
      { value: 'engagement', label: '讨论度' },
      { value: 'sentiment', label: '口碑' },
      { value: 'rating', label: 'Google评分' },
      { value: 'name', label: '名称' },
      { value: 'updated', label: '更新时间' }
    ]
  };
}

/**
 * GET /api/health - 健康检查
 */
function handleHealth(req, res) {
  const startTime = Date.now();
  res.startTime = startTime;
  
  try {
    const { servingData } = loadData();
    
    return {
      status: 'healthy',
      version: servingData.version,
      total_restaurants: servingData.total_count,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  } catch (error) {
    return { error: 'Service unhealthy', status: 503 };
  }
}

// ==================== 路由处理 ====================

function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const params = parsedUrl.query;
  
  // 记录请求
  console.log(`[API] ${req.method} ${pathname} ${JSON.stringify(params)}`);
  
  // CORS预检
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  
  // 只允许GET
  if (req.method !== 'GET') {
    sendError(res, 'Method not allowed', 405);
    return;
  }
  
  // 缓存检查
  const cacheKey = generateCacheKey(pathname, params);
  const cached = getCache(cacheKey);
  if (cached) {
    console.log(`[API] Cache hit: ${pathname}`);
    sendJSON(res, cached);
    return;
  }
  
  // 路由匹配
  try {
    let result;
    
    if (pathname === '/api/restaurants') {
      result = handleListRestaurants(req, res, params);
    } else if (pathname.match(/^\/api\/restaurants\/[^/]+$/)) {
      const id = pathname.split('/').pop();
      result = handleGetRestaurant(req, res, id);
    } else if (pathname === '/api/search') {
      result = handleSearch(req, res, params);
    } else if (pathname === '/api/stats') {
      result = handleStats(req, res);
    } else if (pathname === '/api/filters') {
      result = handleFilters(req, res);
    } else if (pathname === '/api/health') {
      result = handleHealth(req, res);
    } else if (pathname === '/') {
      result = {
        service: 'Bay Area Food Map API',
        version: '3.0.0',
        endpoints: [
          'GET /api/restaurants - 餐厅列表',
          'GET /api/restaurants/:id - 餐厅详情',
          'GET /api/search?q=query - 搜索',
          'GET /api/stats - 统计数据',
          'GET /api/filters - 筛选选项',
          'GET /api/health - 健康检查'
        ]
      };
    } else {
      sendError(res, 'Not found', 404);
      return;
    }
    
    // 检查错误
    if (result.error) {
      sendError(res, result.error, result.status || 500);
      return;
    }
    
    // 缓存结果
    setCache(cacheKey, result);
    
    // 发送响应
    sendJSON(res, result);
    
  } catch (error) {
    console.error('[API] Error:', error);
    sendError(res, 'Internal server error', 500);
  }
}

// ==================== 工具函数 ====================

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

// ==================== 服务器启动 ====================

function startServer() {
  // 预加载数据
  try {
    loadData();
    console.log('[API] Data preloaded successfully');
  } catch (error) {
    console.error('[API] Failed to preload data:', error.message);
  }
  
  const server = http.createServer(handleRequest);
  
  server.listen(CONFIG.port, () => {
    console.log(`[API] Server running on http://localhost:${CONFIG.port}`);
    console.log(`[API] Endpoints:`);
    console.log(`  - http://localhost:${CONFIG.port}/api/restaurants`);
    console.log(`  - http://localhost:${CONFIG.port}/api/search?q=川菜`);
    console.log(`  - http://localhost:${CONFIG.port}/api/stats`);
    console.log(`  - http://localhost:${CONFIG.port}/api/filters`);
  });
  
  return server;
}

// CLI入口
if (require.main === module) {
  startServer();
}

module.exports = { startServer, loadData, handleListRestaurants, handleSearch, handleGetRestaurant, handleStats, handleFilters };
