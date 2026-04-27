-- Limited-time offer banners — admin posts a message that appears at the top
-- of /menu for the active window. Used for weekly promos / specials / events.
CREATE TABLE `ltOffers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `ctaText` varchar(120),
  `ctaUrl` varchar(500),
  `startsAt` timestamp NOT NULL,
  `endsAt` timestamp NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ltOffers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Schedule-ahead orders: optional pickup-at time. Null = ASAP (existing behaviour).
ALTER TABLE `orders` ADD COLUMN `scheduledFor` timestamp NULL;
