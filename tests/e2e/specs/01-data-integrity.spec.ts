import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadDatabase,
  getAllRestaurants,
  getActiveRestaurants,
  getMergedRestaurants,
  findDuplicates,
  validateRestaurant,
} from '../fixtures/database';

const PROJECT_ROOT = path.join(__dirname, '../../../');

test.describe('01 - Data Integrity', () => {
  
  test('database JSON is valid and parseable', () => {
    let data;
    expect(() => {
      data = loadDatabase();
    }).not.toThrow();
    
    expect(data).toBeDefined();
    expect(data.restaurants).toBeDefined();
    expect(Array.isArray(data.restaurants)).toBe(true);
    expect(data.restaurants.length).toBeGreaterThan(0);
  });

  test('all restaurants have required fields', () => {
    const restaurants = getAllRestaurants();
    const errors: string[] = [];
    
    restaurants.forEach((r, idx) => {
      const validationErrors = validateRestaurant(r);
      if (validationErrors.length > 0) {
        errors.push(`Restaurant #${idx} (${r.name || 'unnamed'}): ${validationErrors.join(', ')}`);
      }
    });
    
    expect(errors, `Found ${errors.length} validation errors:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('engagement values are positive numbers', () => {
    const restaurants = getAllRestaurants();
    const invalid = restaurants.filter(r => {
      return typeof r.engagement !== 'number' || r.engagement < 0 || isNaN(r.engagement);
    });
    
    expect(invalid, `Found ${invalid.length} restaurants with invalid engagement`).toHaveLength(0);
  });

  test('sentiment scores are valid (0-1)', () => {
    const restaurants = getAllRestaurants();
    const invalid = restaurants.filter(r => {
      return typeof r.sentiment_score !== 'number' || 
             r.sentiment_score < 0 || 
             r.sentiment_score > 1 ||
             isNaN(r.sentiment_score);
    });
    
    expect(invalid, `Found ${invalid.length} restaurants with invalid sentiment_score`).toHaveLength(0);
  });

  test('post_details have valid structure', () => {
    const restaurants = getAllRestaurants();
    const errors: string[] = [];
    
    restaurants.forEach(r => {
      if (!Array.isArray(r.post_details)) {
        errors.push(`${r.name}: post_details is not an array`);
        return;
      }
      
      r.post_details.forEach((pd, idx) => {
        if (!pd.post_id || pd.post_id.trim() === '') {
          errors.push(`${r.name}: post_details[${idx}] missing post_id`);
        }
        if (!pd.date || !/\d{4}-\d{2}-\d{2}/.test(pd.date)) {
          errors.push(`${r.name}: post_details[${idx}] invalid date format`);
        }
        if (typeof pd.engagement !== 'number' || pd.engagement < 0) {
          errors.push(`${r.name}: post_details[${idx}] invalid engagement`);
        }
      });
    });
    
    expect(errors, `Found ${errors.length} post_details errors:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('no duplicate active restaurants by name+city', () => {
    const duplicates = findDuplicates();
    const activeDuplicates = duplicates.filter(d => {
      // Check if at least one instance is active
      return getAllRestaurants().some(r => 
        r.name === d.name && 
        d.cities.includes(r.city) && 
        r.is_active !== false
      );
    });
    
    expect(activeDuplicates, `Found ${activeDuplicates.length} duplicate names across cities: ${
      activeDuplicates.map(d => `${d.name} (${d.cities.join(', ')})`).join('; ')
    }`).toHaveLength(0);
  });

  test('merged restaurants have correct flags', () => {
    const merged = getMergedRestaurants();
    const errors: string[] = [];
    
    merged.forEach(r => {
      if (!r.merged_to) {
        errors.push(`${r.name}: is_active=false but missing merged_to`);
      } else {
        // Verify merged_to points to an active restaurant
        const target = getAllRestaurants().find(target => 
          target.xiaohongshu_id === r.merged_to || target.name === r.merged_to
        );
        if (!target) {
          errors.push(`${r.name}: merged_to (${r.merged_to}) points to non-existent restaurant`);
        } else if (target.is_active === false) {
          errors.push(`${r.name}: merged_to (${r.merged_to}) points to another merged restaurant`);
        }
      }
    });
    
    expect(errors, `Found ${errors.length} merged restaurant errors:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('google_places data format is valid', () => {
    const restaurants = getAllRestaurants();
    const errors: string[] = [];
    
    restaurants.forEach(r => {
      if (r.google_places) {
        const gp = r.google_places;
        
        if (gp.rating !== undefined) {
          if (typeof gp.rating !== 'number' || gp.rating < 0 || gp.rating > 5) {
            errors.push(`${r.name}: invalid google_places.rating (${gp.rating})`);
          }
        }
        
        if (gp.user_ratings_total !== undefined) {
          if (typeof gp.user_ratings_total !== 'number' || gp.user_ratings_total < 0) {
            errors.push(`${r.name}: invalid google_places.user_ratings_total (${gp.user_ratings_total})`);
          }
        }
        
        if (gp.place_id && typeof gp.place_id !== 'string') {
          errors.push(`${r.name}: invalid google_places.place_id type`);
        }
      }
    });
    
    expect(errors, `Found ${errors.length} google_places errors:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('corrections.json syntax is valid', () => {
    const correctionsPath = path.join(PROJECT_ROOT, 'data/corrections.json');
    
    if (!fs.existsSync(correctionsPath)) {
      return; // File may not exist
    }
    
    let data;
    expect(() => {
      data = JSON.parse(fs.readFileSync(correctionsPath, 'utf-8'));
    }).not.toThrow();
    
    expect(Array.isArray(data)).toBe(true);

    // 验证每个修正项都有必需的字段
    data.forEach((c: any, idx: number) => {
      if (!c.id) {
        throw new Error(`corrections[${idx}]: missing id`);
      }
      if (!c.name) {
        throw new Error(`corrections[${idx}]: missing name`);
      }
      if (!c.corrections || typeof c.corrections !== 'object') {
        throw new Error(`corrections[${idx}]: missing corrections object`);
      }
    });
  });

  test('quality_rules.json is valid', () => {
    const rulesPath = path.join(PROJECT_ROOT, 'data/quality_rules.json');
    
    if (!fs.existsSync(rulesPath)) {
      return;
    }
    
    let data;
    expect(() => {
      data = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    }).not.toThrow();
    
    expect(data).toBeDefined();
    expect(Array.isArray(data.rules)).toBe(true);
  });

  test('database symlink is correct', () => {
    const dbPath = path.join(PROJECT_ROOT, 'data/current/restaurant_database.json');
    
    const stats = fs.lstatSync(dbPath);
    expect(stats.isSymbolicLink(), 'restaurant_database.json should be a symbolic link').toBe(true);
    
    const target = fs.readlinkSync(dbPath);
    expect(target).toContain('restaurant_database_v');
  });

  test('backup directory exists and is writable', () => {
    const backupDir = path.join(PROJECT_ROOT, 'data/backup');
    const transactionDir = path.join(backupDir, 'transactions');
    
    expect(fs.existsSync(backupDir), 'backup/ directory should exist').toBe(true);
    expect(fs.existsSync(transactionDir), 'backup/transactions/ directory should exist').toBe(true);
    
    // Try to write a test file
    const testFile = path.join(transactionDir, '.write_test');
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (e) {
      throw new Error('backup/transactions/ directory is not writable');
    }
  });
});
