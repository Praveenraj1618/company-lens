CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`text` text NOT NULL,
	`published_at` text,
	`fetched_at` text NOT NULL,
	`language` text NOT NULL,
	`region` text NOT NULL,
	`content_hash` text NOT NULL,
	`cluster_id` text NOT NULL,
	`analysis` text NOT NULL,
	`embedding` text,
	`embedding_model` text,
	`content_scope` text NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_articles_company_url` ON `articles` (`company_id`,`url`);--> statement-breakpoint
CREATE INDEX `idx_articles_company_date` ON `articles` (`company_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_articles_company_hash` ON `articles` (`company_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`industry` text NOT NULL,
	`aliases` text NOT NULL,
	`description` text NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_companies_domain` ON `companies` (`domain`);--> statement-breakpoint
CREATE TABLE `leases` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`source_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`scanned` integer DEFAULT 0 NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_runs_started_at` ON `runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`region` text NOT NULL,
	`language` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'unfetched' NOT NULL,
	`last_fetched_at` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_url` ON `sources` (`url`);