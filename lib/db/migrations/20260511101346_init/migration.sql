CREATE TYPE "chapter_status" AS ENUM('locked', 'active', 'done');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY,
	"journey_id" text NOT NULL,
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"status" "chapter_status" DEFAULT 'locked'::"chapter_status" NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"style_id" text NOT NULL,
	"syllabus" jsonb NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"current_chapter_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_journey_idx_unique" ON "chapters" ("journey_id","idx");--> statement-breakpoint
CREATE INDEX "chapters_journey_idx" ON "chapters" ("journey_id");--> statement-breakpoint
CREATE INDEX "journeys_user_idx" ON "journeys" ("user_id");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_journey_id_journeys_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;