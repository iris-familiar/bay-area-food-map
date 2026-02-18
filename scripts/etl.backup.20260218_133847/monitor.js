#!/usr/bin/env node
/**
 * Monitor v2.0 - Data freshness, quality, and pipeline health monitoring
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  projectDir: path.resolve(__dirname, '../..'),
  dataDir: path.join(path.resolve(__dirname, '../..'), 'data', 'current'),
  stateDir: path.join(path.resolve(__dirname, '../..'), 'data', 'state'),
  thresholds: {
    freshness: { warning: 25, critical: 48 },
    quality: { min: 70, target: 85 }
  }
};

const Log = {
  info: (m) => console.log(`[INFO] ${m}`),
  ok: (m) => console.log(`[OK] ${m}`),
  warn: (m) => console.log(`[WARN] ${m}`),
  err: (m) => console.log(`[ERR] ${m}`)
};

class Checker {
  constructor(name) { this.name = name; this.results = []; }
  add(status, msg, details = {}) { this.results.push({ checker: this.name, status, message: msg, details, time: new Date().toISOString() }); }
}

class FreshnessChecker extends Checker {
  constructor() { super('Freshness'); }
  check() {
    const db = path.join(CONFIG.dataDir, 'restaurant_database.json');
    if (!fs.existsSync(db)) { this.add('critical', 'Database not found'); return this.results; }
    
    const stats = fs.statSync(db);
    const hours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    let status = 'ok', msg = `Fresh (${hours.toFixed(1)}h)`;
    if (hours > CONFIG.thresholds.freshness.critical) { status = 'critical'; msg = `Stale (${hours.toFixed(1)}h)`; }
    else if (hours > CONFIG.thresholds.freshness.warning) { status = 'warning'; msg = `Getting stale (${hours.toFixed(1)}h)`; }
    
    this.add(status, msg, { hours: Math.round(hours * 10) / 10 });
    return this.results;
  }
}

class QualityChecker extends Checker {
  constructor() { super('Quality'); }
  check() {
    const db = path.join(CONFIG.dataDir, 'restaurant_database.json');
    if (!fs.existsSync(db)) { this.add('critical', 'Database not found'); return this.results; }
    
    try {
      const data = JSON.parse(fs.readFileSync(db, 'utf8'));
      const restaurants = Array.isArray(data) ? data : Object.values(data);
      
      let total = 0, issues = { name: 0, addr: 0, coord: 0, cuisine: 0 };
      restaurants.forEach(r => {
        let score = 100;
        if (!r.name) { score -= 20; issues.name++; }
        if (!r.address) { score -= 15; issues.addr++; }
        if (!r.latitude || !r.longitude) { score -= 10; issues.coord++; }
        if (!r.cuisine) { score -= 10; issues.cuisine++; }
        total += Math.max(0, score);
      });
      
      const avg = restaurants.length > 0 ? Math.round(total / restaurants.length) : 0;
      let status = 'ok', msg = `Good (${avg}/100)`;
      if (avg < CONFIG.thresholds.quality.min) { status = 'critical'; msg = `Poor (${avg}/100)`; }
      else if (avg < CONFIG.thresholds.quality.target) { status = 'warning'; msg = `Needs work (${avg}/100)`; }
      
      this.add(status, msg, { avgScore: avg, total: restaurants.length, issues });
    } catch (e) {
      this.add('critical', 'Check failed', { error: e.message });
    }
    return this.results;
  }
}

class HealthChecker extends Checker {
  constructor() { super('Health'); }
  check() {
    const cp = path.join(CONFIG.stateDir, 'orchestrator_checkpoint.json');
    if (!fs.existsSync(cp)) { this.add('warning', 'No checkpoint'); return this.results; }
    
    try {
      const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
      let status = 'ok', msg = 'Healthy';
      
      if (data.status === 'failed') { status = 'critical'; msg = 'Last run failed'; }
      else if (data.status === 'running') {
        const hours = (Date.now() - new Date(data.startTime).getTime()) / (1000 * 60 * 60);
        if (hours > 2) { status = 'warning'; msg = 'May be stuck'; }
      }
      
      this.add(status, msg, { lastStatus: data.status, completed: (data.completedPhases || []).length });
    } catch (e) {
      this.add('warning', 'Read failed', { error: e.message });
    }
    return this.results;
  }
}

class ResourceChecker extends Checker {
  constructor() { super('Resources'); }
  check() {
    try {
      const df = execSync(`df -g "${CONFIG.projectDir}" | tail -1`, { encoding: 'utf8' }).trim().split(/\s+/);
      const avail = parseInt(df[3]);
      let status = 'ok', msg = `${avail}GB available`;
      if (avail < 1) { status = 'critical'; msg = `Critical: ${avail}GB`; }
      else if (avail < 2) { status = 'warning'; msg = `Low: ${avail}GB`; }
      this.add(status, msg, { availableGB: avail });
      
      const rawDir = path.join(CONFIG.projectDir, 'raw');
      if (fs.existsSync(rawDir)) {
        const count = fs.readdirSync(rawDir).filter(f => f.endsWith('.json')).length;
        let rstatus = 'ok', rmsg = `${count} files`;
        if (count > 1000) { rstatus = 'warning'; rmsg = `High: ${count} files`; }
        this.add(rstatus, rmsg, { rawFiles: count });
      }
    } catch (e) {
      this.add('warning', 'Check failed', { error: e.message });
    }
    return this.results;
  }
}

class Monitor {
  constructor() { this.checkers = [new FreshnessChecker(), new QualityChecker(), new HealthChecker(), new ResourceChecker()]; }
  
  async runAll() {
    Log.info('Running all checks...');
    const all = [];
    for (const c of this.checkers) {
      try { all.push(...c.check()); } catch (e) { Log.err(`Checker ${c.name} failed: ${e.message}`); }
    }
    return all;
  }
  
  printReport(results) {
    const summary = { critical: 0, warning: 0, ok: 0 };
    results.forEach(r => summary[r.status]++);
    
    console.log('\n=== Monitoring Report ===');
    results.forEach(r => {
      const icon = r.status === 'ok' ? 'OK' : r.status === 'warning' ? 'WARN' : 'ERR';
      console.log(`[${icon}] ${r.checker}: ${r.message}`);
    });
    console.log(`\nSummary: ${summary.ok} OK, ${summary.warning} Warning, ${summary.critical} Critical\n`);
    return summary.critical;
  }
}

async function main() {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);
  const monitor = new Monitor();
  
  switch (cmd) {
    case 'check':
      let checkers = [];
      if (args.includes('--freshness')) checkers.push(new FreshnessChecker());
      if (args.includes('--quality')) checkers.push(new QualityChecker());
      if (args.includes('--health')) checkers.push(new HealthChecker());
      if (args.includes('--resources')) checkers.push(new ResourceChecker());
      
      if (checkers.length === 0 || args.includes('--all')) checkers = monitor.checkers;
      
      const results = [];
      for (const c of checkers) results.push(...c.check());
      const critical = monitor.printReport(results);
      process.exit(critical > 0 ? 1 : 0);
      break;
      
    case 'dashboard':
      console.log('Dashboard mode - checking every 5 minutes (Ctrl+C to stop)');
      const run = async () => {
        const r = await monitor.runAll();
        monitor.printReport(r);
      };
      run();
      setInterval(run, 5 * 60 * 1000);
      break;
      
    case 'help':
    default:
      console.log(`
Monitor v2.0

Usage: node monitor.js <cmd> [options]

Commands:
  check --all           Run all checks
  check --freshness     Check freshness only
  check --quality       Check quality only
  check --health        Check pipeline health
  check --resources     Check resources
  dashboard             Run continuous monitoring
  help                  Show help
`);
  }
}

main().catch(e => { Log.err(e.message); process.exit(1); });
