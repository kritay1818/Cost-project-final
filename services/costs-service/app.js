const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const Cost = require('../../models/Cost');
const { COST_CATEGORIES } = require('../../models/Cost');
const User = require('../../models/User');
const Report = require('../../models/Report');
const { connectDB } = require('../../shared/db');
const { logger } = require('../../shared/logger');
const { httpLogger, createRequestLogger } = require('../../shared/request_logger');
const { AppError, notFoundHandler, errorHandler } = require('../../shared/error');

const SERVICE_NAME = 'costs-service';
const port = process.env.PORT || process.env.COSTS_PORT || 3003;

// Order of categories in GET /api/report response array
const REPORT_CATEGORY_ORDER = ['food', 'education', 'health', 'housing', 'sports'];

// Empty internal map used when storing or building a monthly report
function emptyCostsByCategory() {
  const costs = {};
  for (const category of COST_CATEGORIES) {
    costs[category] = [];
  }
  return costs;
}

// Save one line item inside a report (keeps created_at to build day in API response)
function formatCostItemForStorage(cost) {
  return {
    description: cost.description,
    sum: cost.sum,
    created_at: cost.created_at,
  };
}

// Project document fields to API report item (sum, description, day only)
function formatCostItemForApi(item) {
  const date = item.created_at ? new Date(item.created_at) : null;
  const day = item.day !== undefined ? item.day : date ? date.getDate() : undefined;

  return {
    sum: item.sum,
    description: item.description,
    day,
  };
}

// Derive report year/month from a cost date
function getYearMonth(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

// Make sure every category key exists when reading stored report data
function normalizeCosts(costs) {
  const result = emptyCostsByCategory();
  if (costs && typeof costs === 'object' && !Array.isArray(costs)) {
    for (const category of COST_CATEGORIES) {
      if (Array.isArray(costs[category])) {
        result[category] = costs[category];
      }
    }
  }
  return result;
}

// Turn internal category map into the GET /api/report JSON shape
function formatReportResponse(userid, year, month, costsByCategory) {
  const normalized = normalizeCosts(costsByCategory);

  const costs = REPORT_CATEGORY_ORDER.map((category) => ({
    [category]: normalized[category].map(formatCostItemForApi),
  }));

  return {
    userid,
    year,
    month,
    costs,
  };
}

// Parse id / year / month from query string with explicit Number()
function parseQueryNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { error: `${fieldName} is required` };
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return { error: `${fieldName} must be a number` };
  }
  return { value: num };
}

// Validate POST /api/add body before creating a cost
function validateNewCost(body) {
  const errors = [];

  if (
    body.description === undefined ||
    typeof body.description !== 'string' ||
    body.description.trim() === ''
  ) {
    errors.push('description is required and must be a non-empty string');
  }

  if (body.category === undefined || body.category === null || body.category === '') {
    errors.push('category is required');
  } else if (!COST_CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${COST_CATEGORIES.join(', ')}`);
  }

  if (body.userid === undefined || body.userid === null) {
    errors.push('userid is required');
  } else if (typeof body.userid !== 'number' || Number.isNaN(body.userid)) {
    errors.push('userid must be a number');
  }

  if (body.sum === undefined || body.sum === null) {
    errors.push('sum is required');
  } else if (typeof body.sum !== 'number' || Number.isNaN(body.sum) || body.sum <= 0) {
    errors.push('sum is required and must be a positive number');
  }

  if (body.created_at !== undefined && body.created_at !== null && body.created_at !== '') {
    const date = new Date(body.created_at);
    if (Number.isNaN(date.getTime())) {
      errors.push('created_at must be a valid date');
    }
  }

  return errors;
}

// Lookup user by custom numeric id (not MongoDB _id)
async function findUserById(userId) {
  return User.findOne({ id: userId });
}

// Lookup precomputed monthly report
async function findReport(userid, year, month) {
  return Report.findOne({ userid, year, month });
}

// Build one month of grouped costs directly from the costs collection
async function buildCostsByCategoryFromDb(userid, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const costs = await Cost.find({
    userid,
    created_at: { $gte: startDate, $lt: endDate },
  }).sort({ created_at: 1 });

  const costsByCategory = emptyCostsByCategory();
  for (const cost of costs) {
    costsByCategory[cost.category].push(formatCostItemForStorage(cost));
  }
  return costsByCategory;
}

/*
 * Computed Design Pattern (monthly reports)
 *
 * - Costs are saved in the costs collection.
 * - Reports are saved in the reports collection.
 * - Report key is userid + year + month.
 * - POST /api/add updates or creates the monthly report for that month.
 * - GET /api/report returns an existing report, or builds one from costs and saves it if missing.
 *
 * When updating an existing report, call markModified('costs') before save
 * because the costs field uses Mongoose Mixed type.
 */
async function updateReportWithNewCost(cost) {
  const { year, month } = getYearMonth(cost.created_at);
  const item = formatCostItemForStorage(cost);

  const report = await findReport(cost.userid, year, month);

  if (report) {
    // Append only the new cost (avoid rebuilding the whole month)
    const costs = normalizeCosts(report.costs);
    costs[cost.category].push(item);
    report.costs = costs;
    report.updated_at = new Date();
    report.markModified('costs');
    await report.save();
  } else {
    // First cost in this month — create a new report document
    const costs = emptyCostsByCategory();
    costs[cost.category].push(item);
    await Report.create({
      userid: cost.userid,
      year,
      month,
      costs,
      updated_at: new Date(),
    });
  }
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

  // Create a cost, then update the precomputed monthly report
  app.post('/api/add', async (req, res, next) => {
    try {
      const errors = validateNewCost(req.body);
      if (errors.length > 0) {
        return next(new AppError(errors.join('; '), 400));
      }

      const user = await findUserById(req.body.userid);
      if (!user) {
        return next(new AppError('User not found', 404));
      }

      const costData = {
        description: req.body.description.trim(),
        category: req.body.category,
        userid: req.body.userid,
        sum: req.body.sum,
      };

      if (req.body.created_at !== undefined && req.body.created_at !== null && req.body.created_at !== '') {
        costData.created_at = new Date(req.body.created_at);
      } else {
        costData.created_at = new Date();
      }

      const cost = await Cost.create(costData);
      await updateReportWithNewCost(cost);

      res.status(201).json({
        description: cost.description,
        category: cost.category,
        userid: cost.userid,
        sum: cost.sum,
        created_at: cost.created_at,
      });
    } catch (err) {
      next(err);
    }
  });

  /*
   * GET /api/report — uses the Computed Design Pattern (see updateReportWithNewCost).
   * Return a stored report when possible; otherwise build from costs and save it.
   */
  app.get('/api/report', async (req, res, next) => {
    try {
      const idResult = parseQueryNumber(req.query.id, 'id');
      if (idResult.error) {
        return next(new AppError(idResult.error, 400));
      }

      const yearResult = parseQueryNumber(req.query.year, 'year');
      if (yearResult.error) {
        return next(new AppError(yearResult.error, 400));
      }

      const monthResult = parseQueryNumber(req.query.month, 'month');
      if (monthResult.error) {
        return next(new AppError(monthResult.error, 400));
      }

      const userid = idResult.value;
      const year = yearResult.value;
      const month = monthResult.value;

      if (month < 1 || month > 12) {
        return next(new AppError('month must be a number between 1 and 12', 400));
      }

      const user = await findUserById(userid);
      if (!user) {
        return next(new AppError('User not found', 404));
      }

      const report = await findReport(userid, year, month);

      if (report) {
        return res.json(formatReportResponse(userid, year, month, report.costs));
      }

      const costsByCategory = await buildCostsByCategoryFromDb(userid, year, month);

      await Report.create({
        userid,
        year,
        month,
        costs: costsByCategory,
        updated_at: new Date(),
      });

      res.json(formatReportResponse(userid, year, month, costsByCategory));
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
