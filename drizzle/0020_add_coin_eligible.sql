-- Per-item coin-eligibility flag.
-- Defaults to TRUE so existing rows stay redeemable. Backfills FALSE for the
-- 5 meal-deal/special categories + Mix Grill so coins skip them by default.
-- Admin can flip individual items via the dashboard later (overrides survive
-- Square sync — see square.ts: existing rows keep their flag on update).
ALTER TABLE menuItems ADD COLUMN coinEligible BOOLEAN NOT NULL DEFAULT TRUE;
--> statement-breakpoint
UPDATE menuItems
SET coinEligible = FALSE
WHERE LOWER(category) IN (
  'mix grill',
  'combo meal',
  'deals',
  'fuda combo',
  'fuda week day deal',
  'special momo'
);
