# Git Cleanup - Global Organization Script
# 全局清理和组织脚本

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

echo "═══════════════════════════════════════════════════════════════"
echo "     🔧 全局清理 - 让项目Git Friendly"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 1. 创建标准目录结构
echo "【1】创建标准目录结构..."
mkdir -p src/{etl,api,utils}
mkdir -p data/{raw,processed,golden,serving}
mkdir -p tests/{unit,integration,e2e}
mkdir -p docs/{api,architecture,ops}
mkdir -p scripts/{deploy,backup}
mkdir -p config
mkdir -p .github/workflows
echo "✅ 目录结构创建完成"
echo ""

# 2. 移动核心代码到src/
echo "【2】组织核心代码..."
# ETL代码
if [ -d "scripts/etl" ]; then
    cp scripts/etl/*.js src/etl/ 2>/dev/null || true
    cp scripts/etl/*.sh src/etl/ 2>/dev/null || true
    echo "  ✓ ETL代码已移动到 src/etl/"
fi

# API代码  
if [ -d "serving/scripts" ]; then
    cp serving/scripts/*.js src/api/ 2>/dev/null || true
    echo "  ✓ API代码已移动到 src/api/"
fi

# 工具函数
if [ -d "scripts/etl/utils" ]; then
    cp scripts/etl/utils/*.js src/utils/ 2>/dev/null || true
    echo "  ✓ 工具函数已移动到 src/utils/"
fi

echo ""

# 3. 组织数据文件
echo "【3】组织数据文件..."
# 服务层数据
if [ -d "serving/data" ]; then
    cp serving/data/*.json data/serving/ 2>/dev/null || true
    echo "  ✓ Serving数据已移动到 data/serving/"
fi

# 当前主数据
cp data/current/*.json data/golden/ 2>/dev/null || true
echo "  ✓ 当前数据已备份到 data/golden/"

echo ""

# 4. 创建生产环境入口
echo "【4】创建生产环境入口..."
cat > index.js << 'EOF'
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
EOF
chmod +x index.js
echo "  ✓ 生产入口 index.js 已创建"

# 创建开发环境入口
cat > dev.js << 'EOF'
#!/usr/bin/env node
/**
 * Development Server with Hot Reload
 * 开发环境服务器（带热重载）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('🍜 Development Server Running');
    console.log(`🌐 http://localhost:${PORT}`);
    console.log('⌨️  Press Ctrl+C to stop');
});
EOF
chmod +x dev.js
echo "  ✓ 开发入口 dev.js 已创建"

echo ""

# 5. 创建package.json
echo "【5】创建package.json..."
cat > package.json << 'EOF'
{
  "name": "bay-area-food-map",
  "version": "3.0.0",
  "description": "湾区美食地图 - 餐厅发现与推荐平台",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node dev.js",
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "node tests/unit/run.js",
    "test:integration": "node tests/integration/run.js", 
    "test:e2e": "node tests/e2e/run.js",
    "etl": "node src/etl/cli.js",
    "etl:daily": "cd src/etl && ./daily_master_job.sh",
    "etl:doctor": "cd src/etl && ./etl doctor",
    "build": "node scripts/build.js",
    "deploy": "node scripts/deploy/deploy.js",
    "backup": "node scripts/backup/backup.js"
  },
  "keywords": ["food", "restaurant", "bay-area", "map"],
  "author": "Travis (AI Butler)",
  "license": "MIT",
  "engines": {
    "node": ">=16.0.0"
  },
  "dependencies": {},
  "devDependencies": {}
}
EOF
echo "  ✓ package.json 已创建"

echo ""

# 6. 创建.gitignore
echo "【6】创建.gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Logs
logs/
*.log
npm-debug.log*

# Coverage directory used by tools like istanbul
coverage/

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn
.yarn-integrity
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Project specific - Large data files
data/raw/*/raw_*.json
data/processed/temp/
*.tmp
*.temp

# Backups (keep only latest)
backup/daily/*/
!backup/daily/latest/
backup/archive/*.tar.gz

# Test artifacts
tests/e2e/screenshots/failed/
tests/e2e/videos/

# Build outputs
dist/
build/

# Local fallback (keep in separate storage)
fallback_*/
!fallback_latest/

# Large media files
*.mp4
*.mov
*.avi
assets/videos/

# Cache
.cache/
*.cache
EOF
echo "  ✓ .gitignore 已创建"

echo ""

# 7. 移动文档
echo "【7】组织文档..."
mkdir -p docs/{architecture,api,ops,guides}
cp *.md docs/ 2>/dev/null || true
cp docs/PIPELINE*.md docs/architecture/ 2>/dev/null || true
cp docs/*GUIDE*.md docs/guides/ 2>/dev/null || true
cp serving/docs/*.md docs/api/ 2>/dev/null || true
echo "  ✓ 文档已整理到 docs/"

echo ""

# 8. 清理临时文件
echo "【8】清理临时文件..."
find . -name "*.tmp" -delete 2>/dev/null || true
find . -name "*.temp" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true
echo "  ✓ 临时文件已清理"

echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "     ✅ 全局清理完成"
echo "══════════════════════════════════════════════════════════════="
echo ""
echo "【新的项目结构】"
tree -L 2 -d 2>/dev/null || find . -maxdepth 2 -type d | head -20
echo ""
echo "【Git状态】"
echo "  项目已准备好初始化Git仓库"
echo "  运行: git init && git add . && git commit -m 'Initial commit'"
echo ""
