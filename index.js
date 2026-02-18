#!/usr/bin/env node
/**
 * Bay Area Food Map - Production Entry Point
 * 生产环境入口
 */

const path = require('path');
const { startServer } = require('./src/api/api.js');

const PORT = process.env.PORT || 8080;
const DATA_PATH = path.join(__dirname, 'data', 'serving', 'serving_data.json');

console.log('🍜 Bay Area Food Map Server Starting...');
console.log(`📊 Data: ${DATA_PATH}`);
console.log(`🌐 Port: ${PORT}`);

startServer({
    port: PORT,
    dataPath: DATA_PATH,
    cacheEnabled: true,
    logLevel: process.env.LOG_LEVEL || 'info'
}).catch(err => {
    console.error('❌ Server failed to start:', err);
    process.exit(1);
});
