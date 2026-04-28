@echo off
REM Adds per-item coin_eligible flag (no more hardcoded Mix Grill exclusion).
REM Migration 0020 backfills false for: Mix Grill, Combo Meal, Deals, FUDA Combo,
REM FUDA Week Day Deal, Special Momo. Square sync preserves manual overrides.

cd /d "%~dp0"

echo ===== Removing stale git locks =====
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

echo ===== Staging coin-eligible changes =====
git add drizzle/0020_add_coin_eligible.sql
git add drizzle/schema.ts
git add server/stripe-products.ts
git add server/routers/fudaClub.ts
git add server/square.ts
git add server/fudaClub.coins.test.ts
git add client/src/pages/Checkout.tsx
git add client/src/pages/Payment.tsx
git add client/src/pages/Menu.tsx
git add client/src/pages/FudaClub.tsx

echo ===== Committing =====
git commit -m "Coin-eligibility: per-item flag replaces hardcoded Mix Grill check. Adds menuItems.coinEligible BOOLEAN (default true). Migration 0020 backfills false for Mix Grill + meal-deal categories: Combo Meal, Deals, FUDA Combo, FUDA Week Day Deal, Special Momo (case-insensitive). calculateClubPricing now uses the per-item flag with category-list fallback for legacy callers; renamed isMixGrill semantics to isCoinIneligible (kept field name for backward compat in returned preview shape). Square sync: new items get initial flag from category match, existing items preserve their flag on update so admin overrides survive a re-sync. Client mirrors (Checkout/Payment) updated to a regex-list match for the same categories. New menu badge '10% only · no coin' on ineligible items. FAQ rewritten to cover both Mix Grill + meal deals. Leaflets DL/A5/A4-2up: footnote updated to 'Coin not valid on Meal Deals or Mix Grill'. Edge case: cart with only ineligible items + coin selected → silent fallback (charge full price + 10%, coin stays banked, no error)."

echo ===== Pushing to origin =====
git push origin main

echo.
echo ===== Done. Press any key to close. =====
pause >nul
