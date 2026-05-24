# NaijaGov API — Deployment

## Free Tier Stack

| Layer    | Service | Notes |
|----------|---------|-------|
| API      | Railway | Free tier: $5 credit/month. Sleeps after inactivity — acceptable for MVP |
| Database | Neon    | Free tier: 0.5 GB Postgres, serverless (scales to zero) |
| Frontend | Vercel  | Free tier: unlimited SSG, 100GB bandwidth |
| CDN      | Cloudflare | Free tier: wraps both Vercel and Railway |

## Railway Setup

1. Create a new project at railway.app
2. Connect your GitHub repo
3. Set root directory to `apps/api`
4. Add the environment variables below
5. Deploy command: `pnpm install && pnpm build`
6. Start command: `pnpm start`

## Required Environment Variables

Set these in Railway → Variables:

```
DATABASE_URL          = postgresql://user:pass@host/naijagov?sslmode=require
                        (get from Neon dashboard → Connection string → pooled)

JWT_SECRET            = (generate: openssl rand -base64 32)
                        Must be at least 32 characters

TERMII_API_KEY        = (from termii.com → Settings → API)
TERMII_SENDER_ID      = NaijaGov

NODE_ENV              = production
PORT                  = 8080
```

## Neon Database Setup

1. Create account at neon.tech
2. Create a new project: "naijagov"
3. Copy the **pooled** connection string (port 5432, not 5433)
4. Run migrations:
   ```bash
   psql $DATABASE_URL -f packages/db/migrations/001_geo_schema.sql
   psql $DATABASE_URL -f packages/db/migrations/002_users_reps_elections_feed.sql
   ```
5. Add the otp_pin_cache table (needed by auth service):
   ```sql
   CREATE TABLE otp_pin_cache (
     phone      VARCHAR(15) PRIMARY KEY,
     pin_id     TEXT        NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
6. Seed the database:
   ```bash
   python3 packages/db/seeds/seed.py --data-dir ./data --db $DATABASE_URL
   ```

## Neon Extensions Required

Run these once after creating the Neon database:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "postgis";
```

Note: Neon supports PostGIS on all plans including free.

## CORS

The API allows requests from:
- https://naijagov.ng
- https://www.naijagov.ng
- https://naijagov.vercel.app (Vercel preview URL)
- http://localhost:3000 (dev only)

Update `src/index.ts` CORS config when you have a custom domain.

## Health Check

Railway will ping `GET /health` to confirm the service is alive.
Configure in Railway → Settings → Health Check Path: `/health`

## Keeping Railway Awake (Free Tier)

Railway's free tier sleeps after 30 minutes of inactivity.
Use UptimeRobot (free) to ping `/health` every 5 minutes:
1. Sign up at uptimerobot.com
2. Add monitor: HTTP, URL = https://your-api.railway.app/health
3. Interval: 5 minutes
4. Alert: email when down

## Local Development

```bash
# Install dependencies
pnpm install

# Copy env file
cp apps/api/.env.example apps/api/.env
# Fill in DATABASE_URL with your Neon dev branch URL

# Run API in watch mode
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```
