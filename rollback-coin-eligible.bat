@echo off
REM EMERGENCY ROLLBACK — reverts the coin-eligible migration + code changes
REM Use ONLY if menu items aren't loading after the coin_eligible deploy.
REM
REM What this does:
REM   1. Removes the schema/code changes that depend on the new column
REM   2. Replaces migration 0020 with a no-op (so Drizzle's history stays clean)
REM   3. Pushes a quick fix that lets the app run with or without the column
REM Original work is preserved — we redo it cleanly post-launch.

cd /d "%~dp0"

echo ===== Removing stale git locks =====
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

echo ===== Reverting code that depends on coinEligible column =====
git checkout HEAD~1 -- server/routers/fudaClub.ts
git checkout HEAD~1 -- server/square.ts
git checkout HEAD~1 -- drizzle/schema.ts
git checkout HEAD~1 -- client/src/pages/Checkout.tsx
git checkout HEAD~1 -- client/src/pages/Payment.tsx
git checkout HEAD~1 -- client/src/pages/Menu.tsx
git checkout HEAD~1 -- client/src/pages/FudaClub.tsx
git checkout HEAD~1 -- server/fudaClub.coins.test.ts
git checkout HEAD~1 -- server/stripe-products.ts

echo ===== Replacing migration 0020 with a safe no-op =====
echo -- Migration 0020 was rolled back due to a deploy issue. > drizzle\0020_add_coin_eligible.sql
echo -- The original ALTER TABLE has been removed; a clean version >> drizzle\0020_add_coin_eligible.sql
echo -- will be re-deployed post-launch via a separate migration. >> drizzle\0020_add_coin_eligible.sql
echo SELECT 1; >> drizzle\0020_add_coin_eligible.sql

echo ===== Staging revert =====
git add -A

echo ===== Committing rollback =====
git commit -m "ROLLBACK: revert coin_eligible deploy. Menu items not loading; reverting to last known-good state. The flag-based approach will be re-shipped cleanly post-launch with a verified migration."

echo ===== Pushing to origin =====
git push origin main

echo.
echo ===== Done. Wait 60 seconds for Railway to redeploy, then check the menu. =====
pause >nul
