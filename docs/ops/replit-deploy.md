# Replit Deployment

## Build command (Replit Deployment settings)

The build is configured in `.replit` under `[deployment]`:

```toml
[deployment]
build = "npm run replit-build"
run = "npm run start:replit"
```

**Do NOT** add `npm install` or `npm ci` to the build — Replit runs "Installing packages" automatically first.

If you set the build manually in Replit UI, use:
```
npm run replit-build
```

## Manual step (first deploy)

Run once in Replit Shell before first deploy (or in deployment run command if you prefer):

```
cd apps/web && npx prisma migrate deploy
```

## Scheduled Deployments (cron)

Create three Scheduled Deployments in Replit:

### 1. accounting-sync (every 1 minute)

**Run command (curl):**
```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/accounting-sync"
```

**Schedule:** Every 1 minute

### 2. webhook-process (every 1 minute)

**Run command:**
```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/webhook-process"
```

**Schedule:** Every 1 minute

### 3. qbo-cdc-sync (daily)

**Run command:**
```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/qbo-cdc-sync"
```

**Schedule:** Daily (e.g. 2:00 AM UTC)

## Post-deploy verification

```bash
npm run smoke:replit
```

Ensure `NEXT_PUBLIC_APP_URL` and `HEALTH_ADMIN_TOKEN` (optional) are set.
