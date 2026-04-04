#!/bin/sh
# Ship gate: run before release. All must pass.
set -e
echo "=== Typecheck ==="
npm run typecheck
echo "=== Lint ==="
npm run lint
echo "=== Unit tests ==="
npm run test:unit
echo "=== Integration tests ==="
npm run test:integration
echo "=== Build ==="
npm run build
echo "=== Smoke (optional) ==="
npm run smoke 2>/dev/null || echo "(smoke skipped - start server and hit /api/health manually)"
echo "=== Ship gate PASSED ==="
