const crypto = require('crypto');
const { logger } = require('./logger');

// Application error with UUID id for JSON error responses
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.id = crypto.randomUUID();
  }
}

function notFoundHandler(req, res, next) {
  next(new AppError('Not Found', 404));
}

// Always respond with { id, message }
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const id = err.id || crypto.randomUUID();
  const message = err.message || 'Internal Server Error';

  logger.error({ err, id, statusCode });

  res.status(statusCode).json({ id, message });
}

module.exports = { AppError, notFoundHandler, errorHandler };
