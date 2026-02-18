/**
 * Logger utility for ETL pipeline
 * Provides structured logging with levels and context
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[options.level || 'INFO'];
    this.module = options.module || 'ETL';
    this.enableColors = options.enableColors !== false;
    this.enableTimestamp = options.enableTimestamp !== false;
  }

  _formatMessage(level, message, context = {}) {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
    const levelStr = level.padEnd(5);
    const moduleStr = `[${this.module}]`;
    
    let formatted = '';
    if (timestamp) formatted += `${timestamp} `;
    formatted += `${levelStr} ${moduleStr} ${message}`;
    
    if (Object.keys(context).length > 0) {
      formatted += ` ${JSON.stringify(context)}`;
    }
    
    return formatted;
  }

  _colorize(level, message) {
    if (!this.enableColors) return message;
    
    const colors = {
      DEBUG: '\x1b[36m',  // Cyan
      INFO: '\x1b[32m',   // Green
      WARN: '\x1b[33m',   // Yellow
      ERROR: '\x1b[31m',  // Red
      RESET: '\x1b[0m'
    };
    
    return `${colors[level]}${message}${colors.RESET}`;
  }

  debug(message, context) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log(this._colorize('DEBUG', this._formatMessage('DEBUG', message, context)));
    }
  }

  info(message, context) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.log(this._colorize('INFO', this._formatMessage('INFO', message, context)));
    }
  }

  warn(message, context) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn(this._colorize('WARN', this._formatMessage('WARN', message, context)));
    }
  }

  error(message, context) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error(this._colorize('ERROR', this._formatMessage('ERROR', message, context)));
    }
  }

  // Log progress for batch operations
  progress(current, total, operation) {
    const percentage = Math.round((current / total) * 100);
    this.info(`${operation}: ${current}/${total} (${percentage}%)`);
  }

  // Create child logger with additional context
  child(additionalContext) {
    const childLogger = new Logger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      module: this.module,
      enableColors: this.enableColors,
      enableTimestamp: this.enableTimestamp
    });
    
    const parentLog = this;
    const originalFormat = childLogger._formatMessage.bind(childLogger);
    childLogger._formatMessage = function(level, message, context = {}) {
      return originalFormat(level, message, { ...additionalContext, ...context });
    };
    
    return childLogger;
  }
}

module.exports = { Logger, LOG_LEVELS };
