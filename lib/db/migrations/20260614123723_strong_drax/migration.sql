DROP INDEX "journeys_user_idx";--> statement-breakpoint
CREATE INDEX "journeys_user_updated_idx" ON "journeys" ("user_id","updated_at");