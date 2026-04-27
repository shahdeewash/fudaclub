-- Welcome coin: when a member subscribes mid-day, they get 1 FÜDA Coin issued
-- immediately rather than waiting until tomorrow's 6 AM cron. This flag tracks
-- whether the welcome coin has been issued so it only happens once per sub.
ALTER TABLE `fudaClubSubscriptions` ADD COLUMN `hasReceivedWelcomeCoin` boolean NOT NULL DEFAULT false;
