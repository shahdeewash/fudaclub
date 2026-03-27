CREATE TABLE `menuItemModifierLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`menuItemId` int NOT NULL,
	`modifierListId` int NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `menuItemModifierLists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modifierLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squareModifierListId` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`selectionType` enum('SINGLE','MULTIPLE') NOT NULL DEFAULT 'SINGLE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modifierLists_id` PRIMARY KEY(`id`),
	CONSTRAINT `modifierLists_squareModifierListId_unique` UNIQUE(`squareModifierListId`)
);
--> statement-breakpoint
CREATE TABLE `modifiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`squareModifierId` varchar(255) NOT NULL,
	`modifierListId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`priceInCents` int NOT NULL DEFAULT 0,
	`ordinal` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modifiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `modifiers_squareModifierId_unique` UNIQUE(`squareModifierId`)
);
