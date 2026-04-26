@echo off
REM Generic one-shot helper: clear stuck git locks, commit any staged changes
REM (or auto-stage Menu.tsx if nothing staged), push to GitHub.
REM Useful because the Linux sandbox can't delete Windows-locked .git files.

cd /d "%~dp0"

echo ===== Removing stale git locks =====
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"
if exist ".git\HEAD.lock.tmp"  del /f /q ".git\HEAD.lock.tmp"
if exist ".git\HEAD.lock.tmp2" del /f /q ".git\HEAD.lock.tmp2"
if exist ".git\index.lock.tmp"  del /f /q ".git\index.lock.tmp"
if exist ".git\index.lock.tmp2" del /f /q ".git\index.lock.tmp2"
if exist ".git\index.lock.delete-me" del /f /q ".git\index.lock.delete-me"
if exist ".git\HEAD.lock.delete-me"  del /f /q ".git\HEAD.lock.delete-me"

echo ===== Staging Menu.tsx (allow club + non-members to view menu) =====
git add client/src/pages/Menu.tsx

echo ===== Committing =====
git commit -m "Allow non-corporate-subscribers to view the menu (members and non-members) - Removed the hard subscription gate that was blocking everyone without a corporate B2B subscription, including FUDA Club personal members. - Added a club-status banner: members see '10% off applied at checkout' confirmation; non-members see a soft 'Join the Club' CTA. - Menu page now usable by anyone authenticated."

echo ===== Pushing to origin =====
git push origin main

echo.
echo ===== Done. Press any key to close this window. =====
pause >nul
