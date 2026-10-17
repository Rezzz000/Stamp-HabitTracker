# Stamp, a habit tracker

A full-stack habit tracker with streaks, a 26-week heatmap, and weekly trends.
**React** (Vite) + **Node.js** (Express 4) + **PostgreSQL**.

## What's technically interesting

- **Streaks in pure SQL.** `server/src/routes/habits.js` computes current and longest
  streaks with a gaps-and-islands query (`ROW_NUMBER()` window function, date minus row
  number as the group key), so there is no streak logic in JavaScript.
- **Heatmap and weekly stats** use `generate_series` + `LEFT JOIN` so days with zero
  check-ins still appear, and `date_trunc('week', ...)` for weekly buckets.
- **Idempotent check-ins.** `UNIQUE (habit_id, day)` plus `ON CONFLICT DO NOTHING`
  means toggling twice or double-clicking never creates duplicates.
- **Timezone-safe dates.** `DATE` columns come back as strings and the client sends its
  local "today", so a streak doesn't break because the server is in another timezone.
- **Optimistic UI.** Stamps flip instantly, then the app refetches streaks and charts.
- **Auth** with bcrypt password hashes and JWTs; every query is scoped to the user.
- **Migrations** run in a transaction and are tracked in `schema_migrations`.

## Schema

    users(id, email UNIQUE, password_hash, created_at)
    habits(id, user_id -> users, name, created_at, archived_at)
    check_ins(id, habit_id -> habits, day DATE, UNIQUE(habit_id, day))

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | Returns a JWT |
| GET | `/api/habits?today=YYYY-MM-DD` | Habits with streaks, 30-day rate, last 7 days |
| POST | `/api/habits` | Create a habit |
| DELETE | `/api/habits/:id` | Archive a habit |
| PUT / DELETE | `/api/habits/:id/checkins/:day` | Add or remove a check-in |
| GET | `/api/stats?today=YYYY-MM-DD` | Heatmap days and weekly totals |

## Run locally (Node 16+)

    docker compose up -d                 # Postgres on :5432
    cd server
    cp .env.example .env                 # set JWT_SECRET
    npm install
    npm run migrate && npm run seed      # demo@example.com / demo1234
    npm run dev                          # API on :3001

    # in a second terminal
    cd client && npm install && npm run dev   # app on :5173

## Deploy (Render, Railway or Fly.io)

1. Create a Postgres instance and copy its connection string.
2. Build command: `cd client && npm install && npm run build && cd ../server && npm install`
3. Start command: `cd server && npm run migrate && npm start`
4. Env vars: `DATABASE_URL`, `JWT_SECRET`, and `PGSSL=true` if your host requires SSL.
   Express serves the built React app, so it is a single service.

## Ideas to extend it

- Integration tests for the streak query (including a missed-yesterday case)
- Per-habit weekday targets (for example "Mon/Wed/Fri") and a completion rate that respects them
- Refresh tokens and rate limiting on the auth routes
