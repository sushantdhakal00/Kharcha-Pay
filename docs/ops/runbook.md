# KharchaPay Runbook

## Deploy steps

1. **Pre-deploy**
   - Run smoke tests against staging
   - Verify `ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` set in prod
   - Ensure DB backup is recent (see [Migrations](./migrations.md))

2. **Deploy application**
   - Build: `npm run build`
   - Deploy build output (e.g. Vercel, Docker, Node)
   - Ensure `NODE_ENV=production`

3. **Post-deploy**
   - Verify `GET /api/health` returns 200
   - Check [System Status](/app/settings/system) (Admin) for DB, Redis, Cron
   - Run smoke: `SMOKE_BASE_URL=https://your-prod-url npm run smoke:prod`

## Migration steps

See [migrations.md](./migrations.md).

## Rollback steps

1. Revert application deployment to previous version
2. If migration was applied: restore DB from backup (see migrations.md)
3. Verify `/api/health` and core flows
4. Post-mortem: document cause and remediation

## Common incidents

### Redis down

- **Symptom**: System Status shows Redis Error; chat SSE may fail in multi-instance
- **Action**: Restart Redis; if single-instance, SSE works in-memory (no Redis)
- **Mitigation**: Set `REDIS_URL` only for multi-instance; single-instance can run without Redis

### Cron not running

- **Symptom**: Cron last run times stale; outbox backlog growing
- **Action**:
  1. Verify scheduler (Vercel Cron, cron job) is configured
  2. Ensure `CRON_SECRET` matches scheduler header
  3. Check cron URLs: `/api/cron/accounting-sync`, `/api/cron/webhook-process`, `/api/cron/qbo-cdc-sync`
  4. Inspect System Status → Cron last run

### QBO token expired

- **Symptom**: Accounting sync jobs failing with refresh token error; System Status shows blocked exports
- **Action**: Reconnect QuickBooks in Settings → Integrations → QuickBooks
- **Mitigation**: QBO refresh tokens can expire after 100 days; prompt users to reconnect

### Webhook endpoint failing

- **Symptom**: Webhook dead letters > 0 in System Status
- **Action**: Inspect Webhooks → Attempts; fix endpoint URL/SSL or retry; consider replay
- **Mitigation**: Use HTTPS, valid cert; endpoint should return 2xx quickly

### SSE buffering symptoms

- **Symptom**: Chat messages delayed or delivered in bulk
- **Action**: Ensure reverse proxy disables buffering for SSE (see [sse.md](./sse.md))
- **Mitigation**: Add `X-Accel-Buffering: no`; nginx: `proxy_buffering off`

### Alerting (self-hook)

If no paid monitoring, use an outbound webhook endpoint as a self-hook:
- Create a webhook endpoint pointing to your alerting service (e.g. Slack, PagerDuty)
- Monitor: cron failing 3x, webhook dead letters > 0, QBO auth error
- System Status page shows these metrics; external cron can GET `/api/health/cron` (with `HEALTH_ADMIN_TOKEN`) and trigger alerts

### DB connection failures

- **Symptom**: `/api/health` returns 503; DB Error
- **Action**: Check `DATABASE_URL`; verify pool limits; inspect DB provider status
- **Mitigation**: Connection pooling; failover if provider supports it
