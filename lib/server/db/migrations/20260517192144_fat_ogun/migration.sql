CREATE TYPE "journey_status" AS ENUM('drafting', 'active');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY,
	"journey_id" text NOT NULL,
	"chapter_id" text,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journeys" ADD COLUMN "status" "journey_status" DEFAULT 'active'::"journey_status" NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_journey_chapter_idx" ON "messages" ("journey_id","chapter_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_journey_id_journeys_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chapter_id_chapters_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE;