/**
 * Integration Tests for ETL Pipeline
 * 
 * Tests the full pipeline flow and module interactions.
 */

const { 
  runPipeline, 
  dryRun, 
  standardize, 
  clean, 
  merge, 
  quality 
} = require('../../scripts/etl/index');
const fs = require('fs').promises;
const path = require('path');

// Test data
const TEST_DATA = {
  xiaohongshu: [
    {
      noteId: 'test-001',
      restaurantName: 'Test Restaurant',
      address: '123 Test St, San Francisco, CA',
      cuisine: ['Chinese', 'Sichuan'],
      area: 'SF',
      likedCount: 100,
      commentCount: 20,
      collectedCount: 10
    },
    {
      noteId: 'test-002',
      restaurantName: 'Another Place',
      address: '456 Sample Ave, Oakland, CA',
      cuisine: ['Japanese'],
      area: 'Oakland',
      likedCount: 50,
      commentCount: 10,
      collectedCount: 5
    }
  ],
  
  duplicates: [
    {
      name: 'Duplicate Restaurant',
      address: '123 Main St, San Jose, CA',
      cuisine: ['Chinese'],
      area: 'San Jose',
      engagement: { total: 100, likes: 80, comments: 20, shares: 0 }
    },
    {
      name: 'Duplicate Restaurant',
      address: '123 Main St, San Jose, CA',
      cuisine: ['Chinese', 'Sichuan'],
      area: 'San Jose',
      engagement: { total: 50, likes: 40, comments: 10, shares: 0 }
    }
  ],
  
  invalid: [
    {
      name: '', // Invalid - empty name
      address: '123 Test St',
      cuisine: ['Chinese']
    },
    {
      name: 'Valid Restaurant',
      address: '456 Test Ave',
      cuisine: ['Japanese'],
      rating: 6 // Invalid - out of range
    }
  ]
};

// Helper to create temp directory for tests
async function setupTestDir() {
  const testDir = path.join(__dirname, '../temp');
  await fs.mkdir(testDir, { recursive: true });
  return testDir;
}

// Helper to cleanup test directory
async function cleanupTestDir() {
  const testDir = path.join(__dirname, '../temp');
  try {
    await fs.rm(testDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('ETL Pipeline Integration', () => {
  beforeAll(async () => {
    await setupTestDir();
  });
  
  afterAll(async () => {
    await cleanupTestDir();
  });

  describe('Full Pipeline', () => {
    test('should run complete pipeline successfully', async () => {
      const result = await runPipeline(TEST_DATA.xiaohongshu, {
        dryRun: true,
        logLevel: 'ERROR',
        standardize: { enableGeocoding: false }
      });
      
      expect(result).toBeDefined();
      expect(result.stages).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.input_records).toBe(2);
    });
    
    test('should handle empty input', async () => {
      const result = await runPipeline([], {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.input_records).toBe(0);
      expect(result.stats.output_records).toBe(0);
    });
    
    test('should detect quality issues', async () => {
      const result = await runPipeline(TEST_DATA.invalid, {
        dryRun: true,
        logLevel: 'ERROR',
        standardize: { enableGeocoding: false }
      });
      
      expect(result.quality).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Standardize Module', () => {
    test('should standardize Xiaohongshu format', async () => {
      const result = await standardize(TEST_DATA.xiaohongshu, {
        dryRun: true,
        logLevel: 'ERROR',
        enableGeocoding: false
      });
      
      expect(result.records).toHaveLength(2);
      expect(result.records[0]).toHaveProperty('id');
      expect(result.records[0]).toHaveProperty('name');
      expect(result.records[0]).toHaveProperty('engagement');
      expect(result.records[0]).toHaveProperty('sources');
    });
    
    test('should normalize names', async () => {
      const result = await standardize([{
        name: '  Test Restaurant  ',
        address: '123 Test St'
      }], {
        dryRun: true,
        logLevel: 'ERROR',
        enableGeocoding: false
      });
      
      expect(result.records[0].name_normalized).toBe('test restaurant');
    });
    
    test('should handle missing fields gracefully', async () => {
      const result = await standardize([{ name: 'Test' }], {
        dryRun: true,
        logLevel: 'ERROR',
        enableGeocoding: false
      });
      
      expect(result.records).toHaveLength(1);
      expect(result.records[0].name).toBe('Test');
    });
  });

  describe('Clean Module', () => {
    test('should deduplicate records', async () => {
      const standardized = await standardize(TEST_DATA.duplicates, {
        dryRun: true,
        logLevel: 'ERROR',
        enableGeocoding: false
      });
      
      const result = await clean(standardized.records, {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.input).toBe(2);
      expect(result.stats.output).toBe(1);
      expect(result.stats.duplicates).toBe(1);
    });
    
    test('should validate records', async () => {
      const standardized = await standardize(TEST_DATA.invalid, {
        dryRun: true,
        logLevel: 'ERROR',
        enableGeocoding: false
      });
      
      const result = await clean(standardized.records, {
        dryRun: true,
        validate: true,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.invalid).toBeGreaterThan(0);
    });
    
    test('should filter blocked names', async () => {
      const result = await clean([
        { name: 'Cupertino', address: '123 Test' },
        { name: 'Valid Restaurant', address: '456 Test' }
      ], {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.blocked).toBe(1);
      expect(result.stats.output).toBe(1);
    });
  });

  describe('Merge Module', () => {
    test('should merge records using timestamp strategy', async () => {
      const existing = [{
        id: 'test-001',
        name: 'Existing Restaurant',
        updated_at: '2024-01-01T00:00:00Z',
        version: 1
      }];
      
      const incoming = [{
        id: 'test-001',
        name: 'Updated Restaurant',
        updated_at: '2024-06-01T00:00:00Z'
      }];
      
      const testDir = await setupTestDir();
      const goldenPath = path.join(testDir, 'golden_test.json');
      await fs.writeFile(goldenPath, JSON.stringify(existing), 'utf-8');
      
      const result = await merge(incoming, {
        dryRun: true,
        goldenPath,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.updated).toBe(1);
    });
    
    test('should create new records for non-matches', async () => {
      const incoming = [{
        id: 'new-001',
        name: 'New Restaurant'
      }];
      
      const result = await merge(incoming, {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.stats.created).toBe(1);
    });
  });

  describe('Quality Module', () => {
    test('should calculate completeness score', async () => {
      const records = [
        { id: '1', name: 'Complete', cuisine: ['Chinese'], area: 'SF' },
        { id: '2', name: 'Partial', cuisine: [] },
        { id: '3', name: '', cuisine: ['Japanese'] } // Missing name
      ];
      
      const result = await quality(records, {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.completeness).toBeDefined();
      expect(result.completeness.score).toBeGreaterThan(0);
      expect(result.completeness.score).toBeLessThan(1);
    });
    
    test('should flag records with issues', async () => {
      const records = [
        { 
          id: '1', 
          name: 'Valid', 
          cuisine: ['Chinese'], 
          area: 'SF',
          location: { lat: 37.7749, lng: -122.4194 }
        },
        { 
          id: '2', 
          name: 'Invalid', 
          cuisine: ['Japanese'],
          area: 'SF', 
          rating: 10 // Out of range
        }
      ];
      
      const result = await quality(records, {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.flagged.length).toBeGreaterThan(0);
    });
    
    test('should pass quality gates for valid data', async () => {
      const records = TEST_DATA.xiaohongshu.map((r, i) => ({
        id: `test-${i}`,
        name: r.restaurantName,
        cuisine: r.cuisine,
        area: r.area,
        address: r.address,
        location: { lat: 37.7749, lng: -122.4194 },
        engagement: { total: 100, likes: 80, comments: 20, shares: 0 },
        rating: 4.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      const result = await quality(records, {
        dryRun: true,
        logLevel: 'ERROR'
      });
      
      expect(result.overall_score).toBeGreaterThan(0.8);
    });
  });

  describe('Dry Run Mode', () => {
    test('should not modify data in dry-run mode', async () => {
      const testDir = await setupTestDir();
      const goldenPath = path.join(testDir, 'golden_dryrun.json');
      
      const existingData = [{ id: '1', name: 'Test' }];
      await fs.writeFile(goldenPath, JSON.stringify(existingData), 'utf-8');
      
      await runPipeline([{ name: 'New Restaurant' }], {
        dryRun: true,
        logLevel: 'ERROR',
        merge: { goldenPath },
        standardize: { enableGeocoding: false }
      });
      
      // Verify file wasn't modified
      const afterContent = await fs.readFile(goldenPath, 'utf-8');
      const afterData = JSON.parse(afterContent);
      expect(afterData).toEqual(existingData);
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running integration tests...');
  console.log('Use: npm test');
}
