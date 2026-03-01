# Production Readiness Checklist

## Acceptance criteria (must pass for deploy)

- [ ] **RBAC**: All critical endpoints org-scoped; cross-org access blocked; test suite proves it
- [ ] **DB migrations**: Documented with backup + rollback plan ([migrations.md](./migrations.md))
- [ ] **SSE**: Works behind proxy with buffering disabled; config documented ([sse.md](./sse.md))
- [ ] **Cron + jobs**: CRON_SECRET required; jobs locked; retries safe; status in System Status UI
- [ ] **Security**: Session hardening (HttpOnly, Secure, SameSite); secrets not logged; uploads validated; webhook SSRF guarded
- [ ] **Smoke test**: `npm run smoke:prod` passes on staging
- [ ] **Env**: `ENCRYPTION_KEY` (64-char hex), `CRON_SECRET` (min 16), `NEXT_PUBLIC_APP_URL` set in prod

## Pre-deploy verification

| Check | Command/Action |
|-------|----------------|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test:unit` |
| Integration tests | `npm run test:integration` |
| Build | `npm run build` |
| Smoke (staging) | `SMOKE_BASE_URL=https://staging... npm run smoke:prod` |
| Health | `curl https://staging.../api/health` |

## Post-deploy verification

| Check | Action |
|-------|--------|
| Health | `GET /api/health` returns 200 |
| System Status | Admin → System; DB, Redis, Cron OK |
| Cross-org | Request to random orgId returns 403/404 |
| Webhook | Create endpoint; trigger event; verify delivery |
| QBO | Connect; run sync; verify bills export |
