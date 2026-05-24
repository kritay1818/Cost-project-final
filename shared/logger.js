const pino = require('pino');

// Shared console logger for all services
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

module.exports = { logger };
