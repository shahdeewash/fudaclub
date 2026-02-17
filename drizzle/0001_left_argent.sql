CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`domain` varchar(255) NOT NULL,
	`deliveryThreshold` int NOT NULL DEFAULT 5,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_domain_unique` UNIQUE(`domain`)
);
--> statement-breakpoint
CREATE TABLE `dailyCredits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`creditDate` timestamp NOT NULL,
	`isUsed` boolean NOT NULL DEFAULT false,
	`usedAt` timestamp,
	`orderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dailyCredits_id` PRIMARY KEY(`id`),
	CONSTRAINT `dailyCredits_userId_creditDate_unique` UNIQUE(`userId`,`creditDate`)
);
--> statement-breakpoint
CREATE TABLE `menuItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squareCatalogId` varchar(255),
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`price` int NOT NULL,
	`imageUrl` text,
	`isAvailable` boolean NOT NULL DEFAULT true,
	`isTodaysSpecial` boolean NOT NULL DEFAULT false,
	`specialDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menuItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `menuItems_squareCatalogId_unique` UNIQUE(`squareCatalogId`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`menuItemId` int NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` int NOT NULL,
	`totalPrice` int NOT NULL,
	`isFree` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`squareOrderId` varchar(255),
	`orderNumber` varchar(50) NOT NULL,
	`orderDate` timestamp NOT NULL,
	`status` enum('pending','confirmed','preparing','ready','delivered','canceled') NOT NULL DEFAULT 'pending',
	`fulfillmentType` enum('delivery','pickup') NOT NULL DEFAULT 'pickup',
	`isFreeDelivery` boolean NOT NULL DEFAULT false,
	`dailyCreditUsed` boolean NOT NULL DEFAULT false,
	`subtotal` int NOT NULL,
	`deliveryFee` int NOT NULL DEFAULT 0,
	`tax` int NOT NULL DEFAULT 0,
	`total` int NOT NULL,
	`specialInstructions` text,
	`pushedToKdsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeSubscriptionId` varchar(255),
	`stripeCustomerId` varchar(255),
	`status` enum('active','canceled','past_due','trialing') NOT NULL DEFAULT 'active',
	`planAmount` int NOT NULL DEFAULT 2500,
	`currentPeriodStart` timestamp NOT NULL,
	`currentPeriodEnd` timestamp NOT NULL,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','kitchen') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `companyId` int;