@echo off
REM Stripe webhook hardening: trial_will_end + invoice.payment_succeeded + invoice.payment_failed.

cd /d "%~dp0"

echo ===== Removing stale git locks =====
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"
if exist ".git\HEAD.lock.tmp"  del /f /q ".git\HEAD.lock.tmp"
if exist ".git\HEAD.lock.tmp2" del /f /q ".git\HEAD.lock.tmp2"
if exist ".git\index.lock.tmp"  del /f /q ".git\index.lock.tmp"
if exist ".git\index.lock.tmp2" del /f /q ".git\index.lock.tmp2"
if exist ".git\idx.bak" del /f /q ".git\idx.bak"
if exist ".git\head.bak" del /f /q ".git\head.bak"
if exist ".git\idx2.bak" del /f /q ".git\idx2.bak"

echo ===== Staging webhook changes =====
git add server/_core/index.ts

echo ===== Committing =====
git commit -m "Stripe webhook: handle trial_will_end + invoice.paid + invoice.payment_failed for new 7-day trial. New trial structure (Stripe trial_period_days=7 + add_invoice_items for $80 trial-access fee) means new event types matter on day 1, day 4, day 8. Added three event handlers in _core/index.ts: (1) customer.subscription.trial_will_end fires on day 4 (3 days before $180 charge), mirrors stripeSub.trial_end into local currentPeriodEnd so the in-app onboarding nudge can show the exact billing date. (2) invoice.payment_succeeded logs every paid invoice with amount + customer + sub_id (audit trail for $80 trial fee on day 1 + $180 fortnightly invoices on day 8 onwards). (3) invoice.payment_failed marks the local sub as past_due (defensive race-condition guard in case it races with subscription.updated) and logs LOUDLY with email so admin can reach the member personally before Stripe's dunning emails go out."

echo ===== Pushing to origin =====
git push origin main

echo.
echo ===== Done. Press any key to close this window. =====
pause >nul
