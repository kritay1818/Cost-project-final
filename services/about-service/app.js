const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const { connectDB } = require('../../shared/db');
const { logger } = require('../../shared/logger');
const { httpLogger, createRequestLogger } = require('../../shared/requestLogger');
const { notFoundHandler, errorHandler } = require('../../shared/error');
const { getTeamMembers } = require('./teamMembers');

const SERVICE_NAME = 'about-service';
const PORT = process.env.ABOUT_PORT || 3004;

async function start() {
  await connectDB();

  const app = express();

  app.use(express.json());
  app.use(httpLogger);
  app.use(createRequestLogger(SERVICE_NAME));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  // Team members are hardcoded, not loaded from MongoDB
  app.get('/api/about', (req, res) => {
    res.json(getTeamMembers());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} listening on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});
