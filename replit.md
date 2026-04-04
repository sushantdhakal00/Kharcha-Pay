# KharchaPay

Enterprise finance / treasury platform built on Solana. Next.js 14 monorepo with PostgreSQL and Prisma.

## Project Structure

- `apps/web` - Next.js 14 frontend + API routes (main application)
- `apps/api` - Express API (secondary, not actively used in dev)
- `packages/shared` - Shared TypeScript package (`@kharchapay/shared`)
- `docs/` - Architecture and operations documentation

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Styling**: Tailwind CSS + PostCSS
- **Auth**: JWT (jose library) + argon2 password hashing
- **Blockchain**: Solana (web3.js, SPL Token)
- **Charts**: Recharts

## Development

- **Port**: 5000 (dev and production)
- **Dev command**: `npm run dev --workspace=apps/web`
- **Build**: `npm run build --workspace=apps/web`
- **DB migrations**: `npx prisma migrate deploy --schema=apps/web/prisma/schema.prisma`

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection (auto-set by Replit)
- `JWT_SECRET` - Session token signing (secret, already set)
- `ENCRYPTION_KEY` - AES-256-GCM encryption key (64-char hex)
- `CRON_SECRET` - Shared secret for cron endpoints
- `PORT` - Server port (set to 5000)

## Key Config Changes for Replit

- `apps/web/next.config.js` - Added `allowedDevHosts: true` for Replit proxy
- `apps/web/package.json` - Dev script uses `0.0.0.0` host and `${PORT:-5000}`
