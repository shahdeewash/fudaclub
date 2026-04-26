-- Add "trial" as a valid value for the planType enum on fudaClubSubscriptions.
-- This is the new 7-Day Trial tier ($80 first fortnight, then auto-rolls into $180/fortnight).
-- The default is changed to 'trial' so new signups land on the trial tier unless they pick another plan.
ALTER TABLE `fudaClubSubscriptions` MODIFY COLUMN `planType` enum('trial','fortnightly','monthly') NOT NULL DEFAULT 'trial';
