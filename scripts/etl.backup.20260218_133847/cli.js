#!/usr/bin/env node
/**
 * ETL Pipeline CLI
 * 
 * Command-line interface for running ETL pipeline operations.
 */

const fs = require('fs').promises;
const path = require('path');
const { runPipeline, runFromFile, dryRun } = require('./index');
const { standardize } = require('./standardize');
const { clean } = require('./clean');
const { merge } = require('./merge');
const { quality } = require('./quality');
const { Logger } = require('./utils/logger');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'full',
    input: null,
    output: null,
    dryRun: false,
    logLevel: 'INFO'
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
      case '-m':
        options.mode = args[++i];
        break;
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--log-level':
      case '-l':
        options.logLevel = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
Bay Area Food Map - ETL Pipeline CLI

Usage: node cli.js [options]

Options:
  --mode, -m          Pipeline mode: full, standardize, clean, merge, quality, dry-run
  --input, -i         Input file path (JSON)
  --output, -o        Output file path
  --dry-run          Run without making changes
  --log-level, -l     Log level: DEBUG, INFO, WARN, ERROR
  --help, -h          Show this help message

Examples:
  # Run full pipeline
  node cli.js --mode full --input data/raw/posts.json --output data/golden/restaurants.json

  # Dry run to validate changes
  node cli.js --mode dry-run --input data/raw/posts.json

  # Run only specific stage
  node cli.js --mode standardize --input data/raw/posts.json
  node cli.js --mode quality
`);
}

async function loadInput(inputPath) {
  if (!inputPath) {
    // Try to load from default location
    const defaultPath = '../../data/raw/v2/posts';
    try {
      const files = await fs.readdir(defaultPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      const allPosts = [];
      for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(defaultPath, file), 'utf-8');
        allPosts.push(JSON.parse(content));
      }
      
      return allPosts;
    } catch {
      throw new Error('No input file specified and default location not found');
    }
  }
  
  const content = await fs.readFile(inputPath, 'utf-8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : data.records || [data];
}

async function saveOutput(outputPath, data) {
  if (!outputPath) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Output saved to: ${outputPath}`);
}

async function main() {
  const options = parseArgs();
  const logger = new Logger({ module: 'CLI', level: options.logLevel });
  
  logger.info('ETL Pipeline CLI', { mode: options.mode, dryRun: options.dryRun });
  
  try {
    let result;
    
    switch (options.mode) {
      case 'full':
        const fullData = await loadInput(options.input);
        result = await runPipeline(fullData, {
          dryRun: options.dryRun,
          logLevel: options.logLevel
        });
        break;
        
      case 'dry-run':
        const dryData = await loadInput(options.input);
        result = await dryRun(dryData, { logLevel: options.logLevel });
        break;
        
      case 'standardize':
        const stdData = await loadInput(options.input);
        result = await standardize(stdData, {
          dryRun: options.dryRun,
          logLevel: options.logLevel
        });
        break;
        
      case 'clean':
        const cleanData = await loadInput(options.input);
        result = await clean(cleanData, {
          dryRun: options.dryRun,
          logLevel: options.logLevel
        });
        break;
        
      case 'merge':
        const mergeData = await loadInput(options.input);
        result = await merge(mergeData, {
          dryRun: options.dryRun,
          logLevel: options.logLevel
        });
        break;
        
      case 'quality':
        // Load golden dataset for quality check
        const goldenPath = '../../data/golden/current/restaurant_database.json';
        const goldenContent = await fs.readFile(goldenPath, 'utf-8');
        const goldenData = JSON.parse(goldenContent);
        const records = Array.isArray(goldenData) ? goldenData : goldenData.records;
        result = await quality(records, {
          dryRun: options.dryRun,
          logLevel: options.logLevel
        });
        break;
        
      default:
        console.error(`Unknown mode: ${options.mode}`);
        printHelp();
        process.exit(1);
    }
    
    // Output results
    if (options.output) {
      await saveOutput(options.output, result);
    } else {
      console.log('\n=== Results ===');
      console.log(JSON.stringify(result.stats || result, null, 2));
    }
    
    // Exit with error code if quality checks failed
    if (result.quality && !result.quality.passed && !options.dryRun) {
      console.error('\n❌ Quality checks failed');
      process.exit(1);
    }
    
    console.log('\n✅ Pipeline completed successfully');
    
  } catch (error) {
    logger.error('Pipeline failed', { error: error.message });
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, loadInput, saveOutput };
