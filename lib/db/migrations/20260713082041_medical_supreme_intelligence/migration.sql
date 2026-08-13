ALTER TABLE "chapters" ADD COLUMN "overview" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "sections" jsonb DEFAULT '[]' NOT NULL;