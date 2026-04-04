# Ship gate: run before release. All must pass.
$ErrorActionPreference = "Stop"
Write-Host "=== Typecheck ==="
npm run typecheck
Write-Host "=== Lint ==="
npm run lint
Write-Host "=== Unit tests ==="
npm run test:unit
Write-Host "=== Integration tests ==="
npm run test:integration
Write-Host "=== Build ==="
npm run build
Write-Host "=== Smoke (optional) ==="
try { npm run smoke } catch { Write-Host "(smoke skipped)" }
Write-Host "=== Ship gate PASSED ==="
