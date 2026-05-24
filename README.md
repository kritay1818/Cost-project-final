# Cost Project

A final project for a server-side course. The system manages users, costs, monthly reports, request logs, and team information using Node.js, Express, and MongoDB Atlas.

## Technologies

- **Node.js** — runtime
- **Express** — HTTP server (one app per service)
- **MongoDB Atlas** — cloud database
- **Mongoose** — ODM for MongoDB
- **dotenv** — environment variables
- **pino / pino-http** — structured logging

JavaScript only (no TypeScript).

## Four-process architecture

This project runs **four separate Express processes**, not one app with multiple routers. Each service is its own `app.js` file, listens on its own port, and can be started independently.

All services connect to the **same** MongoDB Atlas database. Shared code lives in `shared/` (database connection, logging, errors). Mongoose models live in `models/`.

```
Cost-project/
├── models/          User, Cost, Log, Report
├── shared/          db, logger, error handling, request logger
└── services/
    ├── logs-service/     port 3001
    ├── users-service/    port 3002
    ├── costs-service/    port 3003
    └── about-service/    port 3004
```

## Services and ports

| Service        | Port | npm script              |
|----------------|------|-------------------------|
| logs-service   | 3001 | `npm run start:logs`    |
| users-service  | 3002 | `npm run start:users`   |
| costs-service  | 3003 | `npm run start:costs`   |
| about-service  | 3004 | `npm run start:about`   |

Each service also exposes `GET /health` for a quick status check.

## Request logging

**Every HTTP request** to any service is saved in the MongoDB `logs` collection (service name, method, path, status code, message, timestamp). Console output uses pino via `pino-http`.

You can view all logs with `GET /api/logs` on the logs-service (port 3001).

## Environment variables

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Required:

| Variable      | Description                                      |
|---------------|--------------------------------------------------|
| `MONGODB_URI` | MongoDB Atlas connection string (all services)   |

Optional: `LOG_LEVEL`, `LOGS_PORT`, `USERS_PORT`, `COSTS_PORT`, `ABOUT_PORT`, `TEAM_MEMBERS`.

## Installation

```bash
npm install
```

## Running the services

Start **each service in its own terminal** (all four must run for full functionality):

```bash
npm run start:logs
npm run start:users
npm run start:costs
npm run start:about
```

For development with auto-restart:

```bash
npm run dev:logs
npm run dev:users
npm run dev:costs
npm run dev:about
```

## Demo user required for submission

Create this user before testing costs and reports:

```json
{
  "id": 123123,
  "first_name": "mosh",
  "last_name": "israeli"
}
```

The `costs`, `reports`, and `logs` collections may be **empty** before you run the tests — that is normal. Create the demo user first, then add costs as shown below.

**User id note:** `id` is a **custom numeric field** stored in the document (for example `123123`). It is **not** MongoDB’s `_id`. All API lookups use this numeric `id`.

## Valid cost categories

When adding a cost, `category` must be one of:

- `food`
- `education`
- `health`
- `housing`
- `sports`

## API endpoints

### about-service (port 3004)

| Method | Path         | Description              |
|--------|--------------|--------------------------|
| GET    | `/api/about` | Team members (hardcoded) |

### users-service (port 3002)

| Method | Path              | Description                    |
|--------|-------------------|--------------------------------|
| GET    | `/api/users`      | List all users                 |
| GET    | `/api/users/:id`  | Get one user by numeric `id`   |
| POST   | `/api/add`        | Create a new user              |

### costs-service (port 3003)

| Method | Path                                      | Description              |
|--------|-------------------------------------------|--------------------------|
| POST   | `/api/add`                                | Create a new cost        |
| GET    | `/api/report?id=&year=&month=`           | Monthly report by user   |

### logs-service (port 3001)

| Method | Path        | Description                    |
|--------|-------------|--------------------------------|
| GET    | `/api/logs` | All request logs (newest first)|

## Example curl commands

Use the demo user `id` **123123**. Start users-service and costs-service before adding costs.

**Health checks**

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

**About — team info**

```bash
curl http://localhost:3004/api/about
```

**Users — create and list**

```bash
curl -X POST http://localhost:3002/api/add \
  -H "Content-Type: application/json" \
  -d '{"id":123123,"first_name":"mosh","last_name":"israeli","birthday":"1990-01-01"}'

curl http://localhost:3002/api/users

curl http://localhost:3002/api/users/123123
```

**Costs — add items**

```bash
curl -X POST http://localhost:3003/api/add \
  -H "Content-Type: application/json" \
  -d '{"description":"milk","category":"food","userid":123123,"sum":20,"created_at":"2026-01-10"}'

curl -X POST http://localhost:3003/api/add \
  -H "Content-Type: application/json" \
  -d '{"description":"doctor","category":"health","userid":123123,"sum":150,"created_at":"2026-01-15"}'

curl -X POST http://localhost:3003/api/add \
  -H "Content-Type: application/json" \
  -d '{"description":"rent","category":"housing","userid":123123,"sum":3000,"created_at":"2026-01-01"}'
```

**Costs — monthly report**

```bash
curl "http://localhost:3003/api/report?id=123123&year=2026&month=1"
```

Example response (after adding milk, doctor, and rent above for January 2026):

```json
{
  "userid": 123123,
  "year": 2026,
  "month": 1,
  "costs": [
    { "food": [{ "sum": 20, "description": "milk", "day": 10 }] },
    { "education": [] },
    { "health": [{ "sum": 150, "description": "doctor", "day": 15 }] },
    { "housing": [{ "sum": 3000, "description": "rent", "day": 1 }] },
    { "sports": [] }
  ]
}
```

**GET /api/users/:id** returns `first_name`, `last_name`, `id`, and `total` (sum of all costs for that user). After the three example costs, `total` is **3170**.

**Logs — view all HTTP requests**

```bash
curl http://localhost:3001/api/logs
```

## Computed reports design pattern

Monthly reports use a **computed / precomputed** pattern:

1. Each cost is stored in the `costs` collection.
2. Reports are stored in the `reports` collection, keyed by **`userid` + `year` + `month`**.
3. When **`POST /api/add`** creates a cost, the matching monthly report is **created or updated** (costs grouped by category: food, health, housing, sports, education).
4. When **`GET /api/report`** is called:
   - If a report already exists in `reports`, it is returned.
   - If not, it is **generated from `costs`**, saved to `reports`, and then returned.

This avoids rebuilding the full report from scratch on every read after the first time, while keeping reports up to date as new costs are added.

## Error responses

Errors are returned as JSON:

```json
{
  "id": "uuid",
  "message": "Human-readable message"
}
```

Common status codes: **400** validation, **404** not found, **409** duplicate user id.
