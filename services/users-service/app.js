const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const Cost = require('../../models/Cost');
const User = require('../../models/User');
const { connectDB } = require('../../shared/db');
const { logger } = require('../../shared/logger');
const { httpLogger, createRequestLogger } = require('../../shared/request_logger');
const { AppError, notFoundHandler, errorHandler } = require('../../shared/error');

const SERVICE_NAME = 'users-service';
const port = process.env.PORT || process.env.USERS_PORT || 3002;

// Response shape for list/create (custom id, no MongoDB _id)
function formatUser(user) {
  const result = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
  };
  if (user.birthday) {
    result.birthday = user.birthday;
  }
  return result;
}

// Parse :id route param with explicit Number()
function parseUserId(param) {
  const id = Number(param);
  if (Number.isNaN(id)) {
    return null;
  }
  return id;
}

// Validate POST /api/add body
function validateNewUser(body) {
  const errors = [];

  if (body.id === undefined || body.id === null) {
    errors.push('id is required');
  } else if (typeof body.id !== 'number' || Number.isNaN(body.id)) {
    errors.push('id must be a number');
  }

  if (
    body.first_name === undefined ||
    typeof body.first_name !== 'string' ||
    body.first_name.trim() === ''
  ) {
    errors.push('first_name is required and must be a non-empty string');
  }

  if (
    body.last_name === undefined ||
    typeof body.last_name !== 'string' ||
    body.last_name.trim() === ''
  ) {
    errors.push('last_name is required and must be a non-empty string');
  }

  if (body.birthday !== undefined && body.birthday !== null && body.birthday !== '') {
    const birthday = new Date(body.birthday);
    if (Number.isNaN(birthday.getTime())) {
      errors.push('birthday must be a valid date');
    }
  }

  return errors;
}

// Aggregate total spend for one userid across all costs
async function getTotalCostsForUser(userid) {
  const result = await Cost.aggregate([
    { $match: { userid } },
    { $group: { _id: null, total: { $sum: '$sum' } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
}

async function start() {
  await connectDB();

  const app = express();

  app.use(express.json());
  app.use(httpLogger);
  app.use(createRequestLogger(SERVICE_NAME));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  app.get('/api/users', async (req, res, next) => {
    try {
      const users = await User.find().sort({ id: 1 });
      res.json(users.map(formatUser));
    } catch (err) {
      next(err);
    }
  });

  // Single user plus total of all their costs
  app.get('/api/users/:id', async (req, res, next) => {
    try {
      const id = parseUserId(req.params.id);
      if (id === null) {
        return next(new AppError('Invalid user id', 400));
      }

      const user = await User.findOne({ id });
      if (!user) {
        return next(new AppError('User not found', 404));
      }

      const total = await getTotalCostsForUser(id);

      res.json({
        first_name: user.first_name,
        last_name: user.last_name,
        id: user.id,
        total,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/add', async (req, res, next) => {
    try {
      const errors = validateNewUser(req.body);
      if (errors.length > 0) {
        return next(new AppError(errors.join('; '), 400));
      }

      const existing = await User.findOne({ id: req.body.id });
      if (existing) {
        return next(new AppError('User with this id already exists', 409));
      }

      const userData = {
        id: req.body.id,
        first_name: req.body.first_name.trim(),
        last_name: req.body.last_name.trim(),
      };

      if (req.body.birthday !== undefined && req.body.birthday !== null && req.body.birthday !== '') {
        userData.birthday = new Date(req.body.birthday);
      }

      const user = await User.create(userData);
      res.status(201).json(formatUser(user));
    } catch (err) {
      if (err.code === 11000) {
        return next(new AppError('User with this id already exists', 409));
      }
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
