-- Coin grace period: when a member cancels mid-subscription, they keep the
-- right to redeem existing FÜDA Coins until the end of the period they paid
-- for, but lose the 10% member discount immediately. coinGraceUntil holds the
-- timestamp (UTC) when coin redemption finally turns off.
ALTER TABLE `fudaClubSubscriptions` ADD COLUMN `coinGraceUntil` timestamp NULL;
