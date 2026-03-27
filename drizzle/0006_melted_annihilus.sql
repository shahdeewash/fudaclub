CREATE TABLE `squareConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`merchantId` varchar(255),
	`merchantName` varchar(255),
	`locationId` varchar(255),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `squareConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `squareConnections_userId_unique` UNIQUE(`userId`)
);
