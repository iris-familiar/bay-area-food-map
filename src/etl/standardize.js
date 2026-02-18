/**
 * Standardize Module (Module 1)
 * 
 * Transforms various input formats into unified schema.
 * Integrates Google Places API for geocoding.
 * 
 * Features:
 * - Multiple input format support (JSON, CSV, API responses)
 * - Google Places API geocoding with caching
 * - Field mapping and transformation
 * - Stream processing for large datasets
 * - Dry-run mode for testing
 */

const { v4: uuidv4 } = require('uuid');
const https = require('https');
const { Logger } = require('./utils/logger');
const { 
  createObjectTransform, 
  createBatchTransform, 
  createRateLimiter,
  collectStream 
} = require('./utils/stream-utils');

// Default configuration
const DEFAULT_CONFIG = {
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  batchSize: 50,
  rateLimitMs: 100,
  dryRun: false,
  enableGeocoding: true,
  geocodeCache: new Map(),
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 10000
};

/**
 * Unified restaurant schema
 */
const UNIFIED_SCHEMA = {
  id: null,
  google_place_id: null,
  name: null,
  name_normalized: null,
  address: null,
  location: { lat: null, lng: null },
  cuisine: [],
  area: null,
  phone: null,
  website: null,
  rating: null,
  price_level: null,
  engagement: { total: 0, likes: 0, comments: 0, shares: 0 },
  recommendations: [],
  recommendations_source: null,
  sources: [],
  verified: false,
  verification_source: null,
  created_at: null,
  updated_at: null,
  version: 1,
  metadata: { raw_input: null, processing_history: [] }
};

/**
 * Input format handlers
 */
const FORMAT_HANDLERS = {
  // Xiaohongshu post format
  xiaohongshu: (raw) => ({
    name: raw.restaurantName || raw.name,
    name_normalized: normalizeName(raw.restaurantName || raw.name),
    address: raw.address,
    cuisine: Array.isArray(raw.cuisine) ? raw.cuisine : [raw.cuisine].filter(Boolean),
    area: raw.area,
    engagement: {
      total: (raw.likedCount || 0) + (raw.commentCount || 0) + (raw.collectedCount || 0),
      likes: raw.likedCount || 0,
      comments: raw.commentCount || 0,
      shares: raw.shareCount || 0
    },
    recommendations: extractRecommendations(raw),
    sources: [{
      platform: 'xiaohongshu',
      post_id: raw.noteId || raw.id,
      url: raw.url || `https://xiaohongshu.com/discovery/item/${raw.noteId || raw.id}`,
      extracted_at: new Date().toISOString()
    }],
    metadata: { raw_input: raw }
  }),
  
  // CSV format
  csv: (raw) => ({
    name: raw.name,
    name_normalized: normalizeName(raw.name),
    address: raw.address,
    phone: raw.phone,
    website: raw.website,
    cuisine: parseArray(raw.cuisine),
    area: raw.area,
    rating: raw.rating ? parseFloat(raw.rating) : null,
    price_level: raw.price_level ? parseInt(raw.price_level) : null,
    metadata: { raw_input: raw }
  }),
  
  // Google Places API format
  google_places: (raw) => ({
    google_place_id: raw.place_id,
    name: raw.name,
    name_normalized: normalizeName(raw.name),
    address: raw.formatted_address || raw.vicinity,
    location: raw.geometry?.location || { lat: null, lng: null },
    phone: raw.formatted_phone_number,
    website: raw.website,
    rating: raw.rating,
    price_level: raw.price_level,
    verified: true,
    verification_source: 'google_places',
    metadata: { raw_input: raw }
  }),
  
  // Generic/default format
  default: (raw) => ({
    name: raw.name || raw.restaurant_name || raw.title,
    name_normalized: normalizeName(raw.name || raw.restaurant_name || raw.title),
    address: raw.address || raw.location || raw.formatted_address,
    cuisine: parseArray(raw.cuisine || raw.cuisines || raw.category),
    area: raw.area || raw.city || raw.neighborhood,
    phone: raw.phone || raw.phone_number || raw.telephone,
    website: raw.website || raw.url,
    rating: raw.rating ? parseFloat(raw.rating) : null,
    price_level: raw.price_level ? parseInt(raw.price_level) : null,
    metadata: { raw_input: raw }
  })
};

/**
 * Normalize restaurant name
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return null;
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ''); // Keep alphanumeric and Chinese
}

/**
 * Parse array from various formats
 */
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Extract recommendations from post text
 */
function extractRecommendations(raw) {
  // If recommendations are already extracted
  if (raw.recommendations && Array.isArray(raw.recommendations)) {
    return raw.recommendations;
  }
  
  // If there's a recommendations string
  if (raw.recommendations_text) {
    return raw.recommendations_text.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  
  return [];
}

/**
 * Make HTTP request with retry logic
 */
async function makeRequest(url, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const retryDelayMs = options.retryDelayMs || 1000;
  const timeoutMs = options.timeoutMs || 10000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        req.setTimeout(timeoutMs);
      });
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, retryDelayMs * attempt));
    }
  }
}

/**
 * Geocode address using Google Places API
 */
async function geocodeAddress(address, config) {
  if (!config.enableGeocoding || !config.googlePlacesApiKey) {
    return { location: null, place_id: null };
  }
  
  // Check cache
  const cacheKey = normalizeName(address);
  if (config.geocodeCache.has(cacheKey)) {
    return config.geocodeCache.get(cacheKey);
  }
  
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${config.googlePlacesApiKey}`;
    
    const response = await makeRequest(url, {
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.timeoutMs
    });
    
    if (response.status === 'OK' && response.results?.length > 0) {
      const result = response.results[0];
      const geocoded = {
        location: result.geometry.location,
        place_id: result.place_id,
        formatted_address: result.formatted_address
      };
      
      // Cache result
      config.geocodeCache.set(cacheKey, geocoded);
      
      return geocoded;
    }
    
    return { location: null, place_id: null, error: response.status };
  } catch (error) {
    return { location: null, place_id: null, error: error.message };
  }
}

/**
 * Get place details from Google Places API
 */
async function getPlaceDetails(placeId, config) {
  if (!config.googlePlacesApiKey || !placeId) {
    return null;
  }
  
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${config.googlePlacesApiKey}`;
    
    const response = await makeRequest(url, {
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.timeoutMs
    });
    
    if (response.status === 'OK' && response.result) {
      return response.result;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Detect input format
 */
function detectFormat(raw) {
  if (raw.noteId || (raw.likedCount !== undefined && raw.commentCount !== undefined)) {
    return 'xiaohongshu';
  }
  if (raw.place_id && raw.geometry) {
    return 'google_places';
  }
  if (raw.csv_row !== undefined) {
    return 'csv';
  }
  return 'default';
}

/**
 * Transform raw record to unified schema
 */
async function transformRecord(raw, format, config, logger) {
  const formatHandler = FORMAT_HANDLERS[format] || FORMAT_HANDLERS.default;
  const transformed = formatHandler(raw);
  
  // Generate ID if not present
  if (!transformed.id) {
    transformed.id = uuidv4();
  }
  
  // Set timestamps
  const now = new Date().toISOString();
  transformed.created_at = transformed.created_at || now;
  transformed.updated_at = now;
  
  // Geocode if address present and no location
  if (transformed.address && (!transformed.location?.lat || !transformed.google_place_id)) {
    logger?.debug('Geocoding address', { address: transformed.address });
    
    if (!config.dryRun) {
      const geocoded = await geocodeAddress(transformed.address, config);
      
      if (geocoded.location) {
        transformed.location = geocoded.location;
      }
      if (geocoded.place_id) {
        transformed.google_place_id = geocoded.place_id;
      }
      if (geocoded.formatted_address) {
        transformed.address = geocoded.formatted_address;
      }
      
      // Get additional details if we have a place_id
      if (geocoded.place_id && config.enableGeocoding) {
        const details = await getPlaceDetails(geocoded.place_id, config);
        if (details) {
          // Merge in additional details
          transformed.phone = transformed.phone || details.formatted_phone_number;
          transformed.website = transformed.website || details.website;
          transformed.rating = transformed.rating || details.rating;
          transformed.price_level = transformed.price_level || details.price_level;
          transformed.verified = true;
          transformed.verification_source = 'google_places';
        }
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, config.rateLimitMs));
    }
  }
  
  // Build final record
  const record = {
    ...UNIFIED_SCHEMA,
    ...transformed,
    metadata: {
      ...UNIFIED_SCHEMA.metadata,
      ...transformed.metadata,
      processing_history: [
        ...transformed.metadata?.processing_history || [],
        {
          step: 'standardize',
          timestamp: now,
          format,
          dry_run: config.dryRun
        }
      ]
    }
  };
  
  return record;
}

/**
 * Standardize module main function
 * 
 * @param {Array|Stream} input - Raw data input
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} Standardized records
 */
async function standardize(input, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'STANDARDIZE', level: options.logLevel || 'INFO' });
  
  logger.info('Starting standardization', { 
    dryRun: config.dryRun, 
    enableGeocoding: config.enableGeocoding,
    batchSize: config.batchSize
  });
  
  const results = [];
  const errors = [];
  
  // Convert input to array if needed
  const inputArray = Array.isArray(input) ? input : [input];
  
  // Process in batches
  for (let i = 0; i < inputArray.length; i += config.batchSize) {
    const batch = inputArray.slice(i, i + config.batchSize);
    
    logger.progress(i + batch.length, inputArray.length, 'Standardizing');
    
    const batchPromises = batch.map(async (raw) => {
      try {
        const format = detectFormat(raw);
        const record = await transformRecord(raw, format, config, logger);
        
        if (config.dryRun) {
          logger.debug('Dry run - record created', { name: record.name });
        }
        
        results.push(record);
        
        return record;
      } catch (error) {
        logger.error('Failed to standardize record', { 
          error: error.message,
          raw: typeof raw === 'object' ? JSON.stringify(raw).slice(0, 200) : raw
        });
        errors.push({ raw, error: error.message });
        return null;
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  logger.info('Standardization complete', { 
    total: inputArray.length, 
    success: results.length, 
    errors: errors.length 
  });
  
  return {
    records: results,
    errors,
    stats: {
      total: inputArray.length,
      success: results.length,
      failed: errors.length
    }
  };
}

/**
 * Create standardization transform stream
 */
function createStandardizeStream(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'STANDARDIZE-STREAM', level: options.logLevel || 'INFO' });
  const rateLimiter = createRateLimiter(1000 / config.rateLimitMs);
  
  return createObjectTransform(async (chunk) => {
    await rateLimiter();
    const format = detectFormat(chunk);
    return await transformRecord(chunk, format, config, logger);
  }, { continueOnError: options.continueOnError });
}

module.exports = {
  standardize,
  createStandardizeStream,
  transformRecord,
  detectFormat,
  normalizeName,
  geocodeAddress,
  UNIFIED_SCHEMA,
  FORMAT_HANDLERS
};
