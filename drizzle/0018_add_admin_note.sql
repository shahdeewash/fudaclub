-- Admin notes on members: VIP, allergy, problem customer, etc.
-- Visible only to admin in the Members tab. Members never see this.
ALTER TABLE `users` ADD COLUMN `adminNote` text NULL;
