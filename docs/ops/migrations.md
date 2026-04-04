# Database Migrations

Production migration plan with backup and rollback steps.

## Pre-migration checklist

- [ ] Schedule during low-traffic window
- [ ] Notify stakeholders
- [ ] Ensure `DATABASE_URL` points to correct environment (staging first)

## Steps (staging → production)

### 1. Backup

**Provider-agnostic (pg_dump):**
```bash
npm run db:backup
# Output: .data/backups/kharchapay_YYYYMMDD_HHMMSS.dump
```

**Cloud providers:**
- **Neon / Supabase / RDS**: Use provider's snapshot/backup before migrate
- **Neon**: Dashboard → Backups → Create restore point
- **Supabase**: Project Settings → Database → Create backup
- **AWS RDS**: `aws rds create-db-snapshot --db-instance-identifier <id>`

### 2. Deploy migrations

```bash
# Generate Prisma client
npm run db:generate

# Apply migrations (production-safe)
npm run db:migrate
# or: npx prisma migrate deploy
```

### 3. Smoke tests

```bash
# Run against staging
SMOKE_BASE_URL=https://staging.example.com npm run smoke:prod
```

### 4. Enum ALTER TYPE (if any migration adds/renames enums)

PostgreSQL enum changes may require manual steps:

1. Review migration file for `ALTER TYPE` / `CREATE TYPE`
2. For additive changes (new enum value): `migrate deploy` handles it
3. For renames or removals: may need downtime; document in migration comment

## Rollback plan

### If migration fails during `prisma migrate deploy`

1. **Do not** run `prisma migrate resolve` unless you know the migration is safe to mark applied
2. Restore from backup:
   ```bash
   pg_restore -d "$DATABASE_URL" --clean --if-exists .data/backups/kharchapay_YYYYMMDD_HHMMSS.dump
   ```
   Or use provider restore (Neon/Supabase/RDS) to a prior point in time.
3. Revert application deployment to previous version
4. Document cause and fix migration locally; re-test before next deploy

### Idempotency

- Migrations are applied in order; Prisma tracks applied migrations in `_prisma_migrations`
- Avoid manual schema edits in production; use migrations only

## Data retention (optional)

- **Chat attachments**: No automatic cleanup; consider retention policy per org
- **Audit events**: See `OrgAuditRetention` for per-org retention
- **Outbox / Webhook attempts**: Historical data retained; dead-letter events can be inspected in admin UI
