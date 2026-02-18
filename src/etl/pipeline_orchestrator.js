#!/usr/bin/env node
/**
 * Pipeline Orchestrator v2.0
 * Unified ETL Pipeline Orchestrator with checkpoint/resume support
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  projectDir: path.resolve(__dirname, '../..'),
  stateDir: path.join(path.resolve(__dirname, '../..'), 'data', 'state'),
  checkpointFile: path.join(path.resolve(__dirname, '../..'), 'data', 'state', 'orchestrator_checkpoint.json'),
  maxRetries: 3,
  retryDelayMs: 5000,
  defaultTimeoutMinutes: 30
};

// Pipeline Definition
const PIPELINE = {
  data_collection: {
    name: 'Data Collection',
    timeout: 60,
    tasks: [
      { id: 'analyze_daily', name: 'Analyze Daily Data', cmd: ['node', 'scripts/analyze-daily-data.js'], critical: false },
      { id: 'update_engagement', name: 'Update Engagement', cmd: ['node', 'scripts/update_post_engagement.js'], critical: false },
      { id: 'batch_collection', name: 'Batch Collection', cmd: ['bash', 'scripts/end_to_end_batch.sh'], critical: true }
    ]
  },
  data_processing: {
    name: 'Data Processing',
    dependsOn: ['data_collection'],
    timeout: 30,
    tasks: [
      { id: 'quality_fix', name: 'Quality Fix', cmd: ['node', 'scripts/auto_quality_fix.js'], critical: false },
      { id: 'apply_corrections', name: 'Apply Corrections', cmd: ['node', 'scripts/apply_corrections.js'], critical: false },
      { id: 'sync_ui', name: 'Sync to UI', cmd: ['node', '-e', `const fs=require('fs'); fs.copyFileSync('data/current/restaurant_database.json','data/current/restaurant_database_v5_ui.json');`], critical: true }
    ]
  },
  validation: {
    name: 'Validation',
    dependsOn: ['data_processing'],
    timeout: 15,
    tasks: [
      { id: 'integrity', name: 'Integrity Check', cmd: ['node', 'scripts/check_file_integrity.js'], critical: false }
    ]
  }
};

// Logger
const Log = {
  info: (m) => console.log(`[INFO] ${m}`),
  success: (m) => console.log(`[OK] ${m}`),
  warn: (m) => console.log(`[WARN] ${m}`),
  error: (m) => console.log(`[ERR] ${m}`)
};

// State Manager
const State = {
  load() {
    if (fs.existsSync(CONFIG.checkpointFile)) {
      try { return JSON.parse(fs.readFileSync(CONFIG.checkpointFile, 'utf8')); } catch (e) {}
    }
    return { runId: null, status: 'new', completedPhases: [], failedPhases: [], taskResults: {} };
  },
  save(state) {
    if (!fs.existsSync(CONFIG.stateDir)) fs.mkdirSync(CONFIG.stateDir, { recursive: true });
    fs.writeFileSync(CONFIG.checkpointFile, JSON.stringify({...state, lastUpdate: new Date().toISOString()}, null, 2));
  },
  reset() {
    if (fs.existsSync(CONFIG.checkpointFile)) fs.unlinkSync(CONFIG.checkpointFile);
    Log.success('State reset');
  }
};

// Task Executor
async function runTask(task, phaseId) {
  Log.info(`Running: ${task.name}`);
  return new Promise((resolve, reject) => {
    const timeoutMs = (task.timeout || 10) * 60 * 1000;
    const child = spawn(task.cmd[0], task.cmd.slice(1), { cwd: CONFIG.projectDir, env: process.env });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timeout')); }, timeoutMs);
    
    child.stdout.on('data', (d) => process.stdout.write(d.toString()));
    child.stderr.on('data', (d) => process.stderr.write(d.toString()));
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function runTaskWithRetry(task, phaseId) {
  for (let i = 1; i <= CONFIG.maxRetries; i++) {
    try {
      if (await runTask(task, phaseId)) return true;
    } catch (e) {
      Log.warn(`Attempt ${i} failed: ${e.message}`);
    }
    if (i < CONFIG.maxRetries) {
      Log.info(`Retrying in ${CONFIG.retryDelayMs}ms...`);
      await new Promise(r => setTimeout(r, CONFIG.retryDelayMs));
    }
  }
  return false;
}

// Run Phase
async function runPhase(phaseId, phaseDef, state) {
  Log.info(`Starting phase: ${phaseDef.name}`);
  state.currentPhase = phaseId;
  State.save(state);
  
  const startTime = Date.now();
  let hasFailure = false;
  
  for (const task of phaseDef.tasks) {
    const success = await runTaskWithRetry(task, phaseId);
    if (!success) {
      if (task.critical) {
        hasFailure = true;
        Log.error(`Critical task failed: ${task.name}`);
        break;
      } else {
        Log.warn(`Task failed but non-critical: ${task.name}`);
      }
    }
  }
  
  state.taskResults[phaseId] = { status: hasFailure ? 'failed' : 'completed', duration: Date.now() - startTime };
  if (hasFailure) state.failedPhases.push(phaseId);
  else state.completedPhases.push(phaseId);
  
  state.currentPhase = null;
  State.save(state);
  
  return !hasFailure;
}

// Main Execution
async function executePipeline(startFrom = null) {
  const state = State.load();
  if (!state.runId || state.status === 'completed') {
    state.runId = crypto.randomUUID();
    state.status = 'running';
    state.completedPhases = [];
    state.startTime = new Date().toISOString();
  }
  
  Log.info(`Pipeline started: ${state.runId}`);
  
  const phases = Object.keys(PIPELINE);
  let startIdx = startFrom ? phases.indexOf(startFrom) : 0;
  if (startIdx === -1) { Log.error(`Unknown phase: ${startFrom}`); process.exit(1); }
  
  for (let i = startIdx; i < phases.length; i++) {
    const phaseId = phases[i];
    const phaseDef = PIPELINE[phaseId];
    
    if (state.completedPhases.includes(phaseId)) {
      Log.info(`Skipping completed phase: ${phaseId}`);
      continue;
    }
    
    if (phaseDef.dependsOn) {
      const missing = phaseDef.dependsOn.filter(d => !state.completedPhases.includes(d));
      if (missing.length > 0) { Log.error(`Missing deps: ${missing.join(',')}`); process.exit(1); }
    }
    
    if (!await runPhase(phaseId, phaseDef, state)) {
      state.status = 'failed';
      State.save(state);
      throw new Error(`Phase ${phaseId} failed`);
    }
  }
  
  state.status = 'completed';
  state.endTime = new Date().toISOString();
  State.save(state);
  Log.success('Pipeline completed!');
}

// CLI
async function main() {
  const cmd = process.argv[2];
  
  switch (cmd) {
    case 'run':
      const phaseArg = process.argv.find(a => a.startsWith('--phase='));
      await executePipeline(phaseArg ? phaseArg.split('=')[1] : null);
      break;
    case 'resume':
      const s = State.load();
      if (s.status === 'completed') { Log.info('Already completed'); return; }
      const resumePhase = s.currentPhase || (s.completedPhases.length > 0 ? 
        Object.keys(PIPELINE)[Object.keys(PIPELINE).indexOf(s.completedPhases.slice(-1)[0]) + 1] : null);
      if (resumePhase) { Log.info(`Resuming from: ${resumePhase}`); await executePipeline(resumePhase); }
      else await executePipeline();
      break;
    case 'status':
      const st = State.load();
      console.log('\n=== Pipeline Status ===');
      console.log(`Run ID: ${st.runId || 'N/A'}`);
      console.log(`Status: ${st.status}`);
      console.log(`Completed: ${(st.completedPhases || []).join(', ') || 'None'}`);
      console.log(`Failed: ${(st.failedPhases || []).join(', ') || 'None'}`);
      break;
    case 'reset':
      State.reset();
      break;
    case 'help':
    default:
      console.log(`
Pipeline Orchestrator v2.0

Usage: node pipeline_orchestrator.js <cmd>

Commands:
  run [--phase=X]     Run pipeline (optionally from phase)
  resume              Resume from checkpoint
  status              Show status
  reset               Reset state
  help                Show help

Phases: ${Object.keys(PIPELINE).join(', ')}
`);
  }
}

main().catch(e => { Log.error(e.message); process.exit(1); });
