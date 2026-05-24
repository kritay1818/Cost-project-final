const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const Log = require('../../models/Log');
const { connectDB } = require('../../shared/db');
const { logger } = require('../../shared/logger');
const { httpLogger, createRequestLogger } = require('../../shared/requestLogger');
const { notFoundHandler, errorHandler } = require('../../shared/error');

const SERVICE_NAME = 'logs-service';
const port = process.env.PORT || process.env.LOGS_PORT || 3001;

async function start() {
  await connectDB();

  const app = express();

  app.use(express.json());
  app.use(httpLogger);
  app.use(createRequestLogger(SERVICE_NAME));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  // All HTTP logs from every service, newest first
  app.get('/api/logs', async (req, res, next) => {
    try {
      const logs = await Log.find().sort({ created_at: -1 });
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(port, () => {
    logger.info(`${SERVICE_NAME} listening on port ${port}`);
  });
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});
