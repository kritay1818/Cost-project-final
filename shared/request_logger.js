const pinoHttp = require('pino-http');
const Log = require('../models/Log');
const { logger } = require('./logger');

const httpLogger = pinoHttp({ logger });

// After each HTTP request, persist one row in the logs collection
function createRequestLogger(serviceName) {
  return function requestLogger(req, res, next) {
    res.on('finish', () => {
      Log.create({
        service: serviceName,
        method: req.method,
        path: req.originalUrl || req.url,
        status_code: res.statusCode,
        message: res.statusMessage || '',
      }).catch((err) => {
        logger.error({ err }, 'Failed to save request to logs collection');
      });
    });

    next();
  };
}

module.exports = { httpLogger, createRequestLogger };
