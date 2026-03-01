/**
 * Vitest setup: set test env vars before any server code imports env.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-jwt-secret-must-be-at-least-32-chars";
