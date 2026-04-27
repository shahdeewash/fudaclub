-- Founding-50 pricing lock — track who got in early so we honor their original price
-- after the launch-window price increase.
ALTER TABLE `fudaClubSubscriptions`
  ADD COLUMN `isFoundingMember` boolean NOT NULL DEFAULT false,
  ADD COLUMN `lockedPriceUntil` timestamp NULL;

-- Lookup index — the homepage needs to count active subs to show "X / 50 spots taken"
-- on every visit, so we should be able to do this fast.
CREATE INDEX `idx_fuda_club_status_founding` ON `fudaClubSubscriptions` (`status`, `isFoundingMember`);
