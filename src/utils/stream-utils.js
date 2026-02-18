/**
 * Stream utilities for ETL pipeline
 * Provides stream-based processing for large datasets
 */

const { Transform, Readable } = require('stream');

/**
 * Create a transform stream that processes JSON objects
 */
function createObjectTransform(transformFn, options = {}) {
  return new Transform({
    objectMode: true,
    async transform(chunk, encoding, callback) {
      try {
        const result = await transformFn(chunk);
        if (result !== null && result !== undefined) {
          this.push(result);
        }
        callback();
      } catch (error) {
        if (options.continueOnError) {
          this.emit('processing_error', { chunk, error });
          callback();
        } else {
          callback(error);
        }
      }
    }
  });
}

/**
 * Create a batch transform stream
 */
function createBatchTransform(batchSize, processBatchFn, options = {}) {
  let buffer = [];
  
  return new Transform({
    objectMode: true,
    async transform(chunk, encoding, callback) {
      buffer.push(chunk);
      
      if (buffer.length >= batchSize) {
        try {
          const results = await processBatchFn([...buffer]);
          if (Array.isArray(results)) {
            results.forEach(r => this.push(r));
          }
          buffer = [];
          callback();
        } catch (error) {
          if (options.continueOnError) {
            this.emit('batch_error', { batch: buffer, error });
            buffer = [];
            callback();
          } else {
            callback(error);
          }
        }
      } else {
        callback();
      }
    },
    async flush(callback) {
      if (buffer.length > 0) {
        try {
          const results = await processBatchFn(buffer);
          if (Array.isArray(results)) {
            results.forEach(r => this.push(r));
          }
          callback();
        } catch (error) {
          callback(error);
        }
      } else {
        callback();
      }
    }
  });
}

/**
 * Create a readable stream from an array
 */
function createArrayStream(array) {
  let index = 0;
  return new Readable({
    objectMode: true,
    read() {
      if (index < array.length) {
        this.push(array[index++]);
      } else {
        this.push(null);
      }
    }
  });
}

/**
 * Collect stream results into an array
 */
function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    
    stream.on('data', (chunk) => results.push(chunk));
    stream.on('processing_error', ({ error }) => errors.push(error));
    stream.on('batch_error', ({ error }) => errors.push(error));
    stream.on('end', () => resolve({ results, errors }));
    stream.on('error', reject);
  });
}

/**
 * Rate limiter for stream processing
 */
function createRateLimiter(opsPerSecond) {
  const intervalMs = 1000 / opsPerSecond;
  let lastOpTime = 0;
  
  return async function rateLimit() {
    const now = Date.now();
    const timeSinceLastOp = now - lastOpTime;
    
    if (timeSinceLastOp < intervalMs) {
      await new Promise(resolve => setTimeout(resolve, intervalMs - timeSinceLastOp));
    }
    
    lastOpTime = Date.now();
  };
}

/**
 * Create a filter stream
 */
function createFilterStream(filterFn) {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        if (filterFn(chunk)) {
          this.push(chunk);
        }
        callback();
      } catch (error) {
        callback(error);
      }
    }
  });
}

/**
 * Create a counter stream for monitoring
 */
function createCounterStream(onCount) {
  let count = 0;
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      count++;
      if (onCount && count % 100 === 0) {
        onCount(count);
      }
      this.push(chunk);
      callback();
    },
    flush(callback) {
      if (onCount) {
        onCount(count, true);
      }
      callback();
    }
  });
}

module.exports = {
  createObjectTransform,
  createBatchTransform,
  createArrayStream,
  collectStream,
  createRateLimiter,
  createFilterStream,
  createCounterStream
};
