/**
 * Validation utilities for ETL pipeline
 */

const VALIDATION_RULES = {
  // String validations
  required: (value, field) => {
    if (value === undefined || value === null || value === '') {
      return { valid: false, error: `${field} is required` };
    }
    return { valid: true };
  },
  
  minLength: (value, field, min) => {
    if (value && value.length < min) {
      return { valid: false, error: `${field} must be at least ${min} characters` };
    }
    return { valid: true };
  },
  
  maxLength: (value, field, max) => {
    if (value && value.length > max) {
      return { valid: false, error: `${field} must be at most ${max} characters` };
    }
    return { valid: true };
  },
  
  // Number validations
  range: (value, field, min, max) => {
    if (value !== undefined && value !== null) {
      const num = Number(value);
      if (isNaN(num) || num < min || num > max) {
        return { valid: false, error: `${field} must be between ${min} and ${max}` };
      }
    }
    return { valid: true };
  },
  
  latitude: (value, field) => {
    if (value !== undefined && value !== null) {
      return VALIDATION_RULES.range(value, field, -90, 90);
    }
    return { valid: true };
  },
  
  longitude: (value, field) => {
    if (value !== undefined && value !== null) {
      return VALIDATION_RULES.range(value, field, -180, 180);
    }
    return { valid: true };
  },
  
  rating: (value, field) => {
    if (value !== undefined && value !== null) {
      return VALIDATION_RULES.range(value, field, 0, 5);
    }
    return { valid: true };
  },
  
  priceLevel: (value, field) => {
    if (value !== undefined && value !== null) {
      return VALIDATION_RULES.range(value, field, 1, 4);
    }
    return { valid: true };
  },
  
  // Array validations
  notEmpty: (value, field) => {
    if (Array.isArray(value) && value.length === 0) {
      return { valid: false, error: `${field} cannot be empty` };
    }
    return { valid: true };
  },
  
  // Type validations
  isString: (value, field) => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { valid: false, error: `${field} must be a string` };
    }
    return { valid: true };
  },
  
  isNumber: (value, field) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'string') {
        const num = Number(value);
        if (isNaN(num)) {
          return { valid: false, error: `${field} must be a number` };
        }
      } else if (typeof value !== 'number') {
        return { valid: false, error: `${field} must be a number` };
      }
    }
    return { valid: true };
  },
  
  isArray: (value, field) => {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return { valid: false, error: `${field} must be an array` };
    }
    return { valid: true };
  },
  
  // Format validations
  isUrl: (value, field) => {
    if (value) {
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, error: `${field} must be a valid URL` };
      }
    }
    return { valid: true };
  },
  
  isIsoDate: (value, field) => {
    if (value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return { valid: false, error: `${field} must be a valid ISO date` };
      }
    }
    return { valid: true };
  }
};

/**
 * Restaurant record schema validator
 */
const RESTAURANT_SCHEMA = {
  name: [
    { rule: 'required' },
    { rule: 'isString' },
    { rule: 'minLength', params: [2] },
    { rule: 'maxLength', params: [100] }
  ],
  'location.lat': [
    { rule: 'latitude' }
  ],
  'location.lng': [
    { rule: 'longitude' }
  ],
  rating: [
    { rule: 'rating' }
  ],
  price_level: [
    { rule: 'priceLevel' }
  ],
  website: [
    { rule: 'isUrl' }
  ],
  created_at: [
    { rule: 'isIsoDate' }
  ],
  updated_at: [
    { rule: 'isIsoDate' }
  ]
};

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Validate a single field
 */
function validateField(value, field, validations) {
  const errors = [];
  
  for (const validation of validations) {
    const validator = VALIDATION_RULES[validation.rule];
    if (!validator) {
      errors.push(`Unknown validation rule: ${validation.rule}`);
      continue;
    }
    
    const params = validation.params || [];
    const result = validator(value, field, ...params);
    
    if (!result.valid) {
      errors.push(result.error);
    }
  }
  
  return errors;
}

/**
 * Validate a record against schema
 */
function validateRecord(record, schema = RESTAURANT_SCHEMA) {
  const errors = [];
  
  for (const [field, validations] of Object.entries(schema)) {
    const value = getNestedValue(record, field);
    const fieldErrors = validateField(value, field, validations);
    errors.push(...fieldErrors);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create custom validator
 */
function createValidator(schema) {
  return (record) => validateRecord(record, schema);
}

/**
 * Check if location is within Bay Area bounding box
 */
function isInBayArea(lat, lng) {
  // Approximate bounding box for Bay Area
  const bounds = {
    minLat: 36.5,
    maxLat: 38.5,
    minLng: -123.5,
    maxLng: -121.5
  };
  
  return lat >= bounds.minLat && lat <= bounds.maxLat &&
         lng >= bounds.minLng && lng <= bounds.maxLng;
}

/**
 * Calculate Z-score for outlier detection
 */
function calculateZScore(value, mean, stdDev) {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Calculate statistics for a numeric array
 */
function calculateStats(values) {
  const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
  
  if (validValues.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
  }
  
  const sum = validValues.reduce((a, b) => a + b, 0);
  const mean = sum / validValues.length;
  const squaredDiffs = validValues.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / validValues.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    stdDev,
    min: Math.min(...validValues),
    max: Math.max(...validValues),
    count: validValues.length
  };
}

module.exports = {
  VALIDATION_RULES,
  RESTAURANT_SCHEMA,
  validateRecord,
  validateField,
  createValidator,
  getNestedValue,
  isInBayArea,
  calculateZScore,
  calculateStats
};
