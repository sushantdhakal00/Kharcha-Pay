# Release Notes

## Production Readiness Release

### Modules shipped

- **P2P (Procure-to-Pay)**: PO, Receipt, Invoice, Match, approvals, payments
- **Vendor 360 + Onboarding**: Vendor management, documents, bank change, onboarding cases
- **Team Chat**: SSE real-time updates, Redis Pub/Sub for multi-instance, attachments
- **Outbox + Webhooks**: Event-driven webhooks, retries, dead-letter, observability
- **QBO Integration**: OAuth, export (bills, payments), inbound webhooks, CDC sync, reconciliation

### Production hardening

- **Environment**: Fail-fast validation; `ENCRYPTION_KEY`, `CRON_SECRET` required in prod
- **Health endpoints**: `/api/health` (public), `/api/health/db`, `/api/health/redis`, `/api/health/cron` (admin token when set)
- **Cron**: `CRON_SECRET` required; last run tracked in DB
- **SSE**: `X-Accel-Buffering: no`; nginx/proxy config documented
- **Security**: Session cookies (HttpOnly, Secure, SameSite); upload MIME/magic validation; webhook SSRF guards (HTTPS, no localhost/private IP)
- **RBAC**: Org-scoped routes; cross-org access blocked

### Known limitations

- **SSE active connections**: Not tracked; shown as N/A in System Status
- **Idle session timeout**: 7-day cookie; no server-side idle timeout
- **Logout everywhere**: Not implemented; user must rely on jwtVersion bump for invalidation
- **Alerting**: No built-in paid monitoring; use outbound webhooks for self-hook alerts
- **Multi-currency**: QBO multi-currency supported; local org currency is single

### Next priorities

1. Server-side idle timeout + absolute session lifetime
2. "Logout everywhere" endpoint
3. SSE connection count tracking
4. Structured logging with correlation IDs
5. Native alert hooks (email/Slack on cron fail, webhook dead letters, QBO auth error)
