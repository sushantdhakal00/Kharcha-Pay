/**
 * Optional standalone API server.
 * For single-process deployment on Replit, the API runs as Next.js Route Handlers in apps/web.
 * Run this only if you need a separate API process.
 */
import express from "express";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
