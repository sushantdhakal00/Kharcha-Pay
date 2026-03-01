# Environment Variables

Single source of truth for environment configuration. All values are validated on boot.

## Required (production)

| Variable | Description | Secret |
|----------|-------------|--------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | At least 32 characters; used for session tokens and CSRF | Yes |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM (tokens at rest); **required in prod** | Yes |
| `CRON_SECRET` | Shared secret for cron endpoints (Bearer or X-Cron-Secret header) | Yes |
| `HEALTH_ADMIN_TOKEN` | Optional; when set, required (Bearer or X-Health-Token) for /api/health/db, /api/health/redis, /api/health/cron | Yes |
| `NEXT_PUBLIC_APP_URL` | Base URL for links and webhook signatures (e.g. `https://app.example.com`) | No |

## Conditionally required

| Variable | Required when | Secret |
|----------|---------------|--------|
| `REDIS_URL` | Multi-instance deployment (SSE, chat pub/sub) | Yes |
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | QuickBooks integration enabled | Yes |

## Optional (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | — | `debug` \| `info` \| `warn` \| `error` |
| `TRUST_PROXY` | false | Set `1` or `true` behind reverse proxy |
| `RECEIPT_STORAGE_DIR` | — | Override receipt file storage path |
| `CHAT_ATTACHMENT_STORAGE_DIR` | `.data/chat-attachments` | Override chat attachment storage path |
| `ORG_CREATE_FEE_SOL` | `0.006` | Solana org creation fee |
| `ORG_CREATE_TREASURY_PUBKEY` | — | Treasury pubkey for org setup |
| `DEMO_MODE` | — | Enable demo mode |
| `NEXT_PUBLIC_INTERNAL_MODE` | — | Show internal/debug sections |

## Storage

| Variable | Description |
|----------|-------------|
| `RECEIPT_STORAGE_DIR` | Local receipt file storage; empty = default under `.data/` |
| `CHAT_ATTACHMENT_STORAGE_DIR` | Chat attachment storage; empty = `.data/chat-attachments` |

## Solana (optional)

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URL` | Devnet RPC |
| `SOLANA_RPC_URL_MAINNET` | Mainnet RPC |
| `SOLANA_RPC_BASIC_USER` / `SOLANA_RPC_BASIC_PASS` | Basic auth for RPC |
| `TREASURY_KEYPAIR_JSON` | JSON keypair for treasury operations |

## Fail-fast behavior

- On boot (first import of `@/lib/env`), production (`NODE_ENV=production`) validates:
  - `DATABASE_URL`, `JWT_SECRET` (min 32 chars)
  - `NEXT_PUBLIC_APP_URL` (required, must be valid URL)
  - `ENCRYPTION_KEY` (required; no fallback to JWT_SECRET in prod)
  - `CRON_SECRET` (required for cron endpoints)
- Missing or invalid values cause process exit with a clear message.
