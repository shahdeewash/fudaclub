CREATE TABLE `fudaClosureDates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closureDate` date NOT NULL,
	`reason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fudaClosureDates_id` PRIMARY KEY(`id`),
	CONSTRAINT `fudaClosureDates_closureDate_unique` UNIQUE(`closureDate`)
);
--> statement-breakpoint
CREATE TABLE `fudaClubSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeSubscriptionId` varchar(255),
	`stripeCustomerId` varchar(255),
	`status` enum('active','canceled','past_due','trialing','frozen') NOT NULL DEFAULT 'active',
	`introUsed` boolean NOT NULL DEFAULT false,
	`frozenUntil` timestamp,
	`frozenAt` timestamp,
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fudaClubSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `fudaClubSubscriptions_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `fudaCoins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reason` enum('daily','referral','streak_bonus','rollover','admin') NOT NULL DEFAULT 'daily',
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`usedOnOrderId` int,
	`isUsed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fudaCoins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `venueName` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `venueAddress` text;--> statement-breakpoint
ALTER TABLE `users` ADD `referralCode` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `referredBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_referralCode_unique` UNIQUE(`referralCode`);