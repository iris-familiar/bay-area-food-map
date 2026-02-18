import * as fs from 'fs';
import * as path from 'path';

export interface Restaurant {
  name: string;
  xiaohongshu_id: string;
  region: string;
  city: string;
  cuisine?: string;
  cuisine_type?: string;
  engagement: number;
  sentiment_score: number;
  mention_count: number;
  google_places?: {
    place_id: string;
    name: string;
    rating: number;
    user_ratings_total: number;
    formatted_address: string;
    website?: string;
    phone?: string;
  };
  post_details: Array<{
    post_id: string;
    title?: string;
    date: string;
    engagement: number;
    context?: string;
  }>;
  recommendations?: string[];
  sources: string[];
  is_active?: boolean;
  merged_to?: string;
  merge_reason?: string;
}

export interface Database {
  restaurants: Restaurant[];
  metadata?: {
    version?: string;
    updated_at?: string;
  };
}

const DB_PATH = path.join(__dirname, '../../../data/current/restaurant_database.json');

export function loadDatabase(): Database {
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  return data;
}

export function getAllRestaurants(): Restaurant[] {
  return loadDatabase().restaurants || [];
}

export function getActiveRestaurants(): Restaurant[] {
  return getAllRestaurants().filter(r => r.is_active !== false);
}

export function getMergedRestaurants(): Restaurant[] {
  return getAllRestaurants().filter(r => r.is_active === false && r.merged_to);
}

export function getRestaurantByName(name: string): Restaurant | undefined {
  return getAllRestaurants().find(r => r.name === name);
}

export function getRestaurantById(id: string): Restaurant | undefined {
  return getAllRestaurants().find(r => r.xiaohongshu_id === id);
}

export function findDuplicates(): Array<{ name: string; cities: string[]; count: number }> {
  const nameCityMap = new Map<string, Set<string>>();
  
  getAllRestaurants().forEach(r => {
    const key = r.name;
    if (!nameCityMap.has(key)) {
      nameCityMap.set(key, new Set());
    }
    nameCityMap.get(key)!.add(r.city);
  });
  
  return Array.from(nameCityMap.entries())
    .filter(([_, cities]) => cities.size > 1)
    .map(([name, cities]) => ({
      name,
      cities: Array.from(cities),
      count: cities.size
    }));
}

export function validateRestaurant(r: Restaurant): string[] {
  const errors: string[] = [];
  
  if (!r.name || r.name.trim() === '') {
    errors.push('Missing name');
  }
  
  if (!r.xiaohongshu_id || r.xiaohongshu_id.trim() === '') {
    errors.push('Missing xiaohongshu_id');
  }
  
  if (!r.region || r.region.trim() === '') {
    errors.push('Missing region');
  }
  
  if (!r.city || r.city.trim() === '') {
    errors.push('Missing city');
  }
  
  if (typeof r.engagement !== 'number' || r.engagement < 0) {
    errors.push('Invalid engagement');
  }
  
  if (typeof r.sentiment_score !== 'number' || r.sentiment_score < 0 || r.sentiment_score > 1) {
    errors.push('Invalid sentiment_score');
  }
  
  if (!Array.isArray(r.post_details)) {
    errors.push('Missing post_details array');
  } else {
    r.post_details.forEach((pd, idx) => {
      if (!pd.post_id) errors.push(`post_details[${idx}]: missing post_id`);
      if (!pd.date) errors.push(`post_details[${idx}]: missing date`);
      if (typeof pd.engagement !== 'number') errors.push(`post_details[${idx}]: invalid engagement`);
    });
  }
  
  if (r.is_active === false) {
    if (!r.merged_to) {
      errors.push('Merged restaurant missing merged_to');
    }
  }
  
  return errors;
}
