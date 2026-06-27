ALTER TABLE "journeys" ALTER COLUMN "syllabus" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "journeys_user_updated_idx";--> statement-breakpoint
CREATE INDEX "journeys_user_updated_idx" ON "journeys" ("user_id","updated_at","id");