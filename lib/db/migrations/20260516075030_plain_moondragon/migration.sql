ALTER TABLE "journeys" ALTER COLUMN "memory" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "journeys" ALTER COLUMN "memory" SET DATA TYPE jsonb USING CASE WHEN "memory" = '' THEN '[]'::jsonb ELSE jsonb_build_array("memory") END;--> statement-breakpoint
ALTER TABLE "journeys" ALTER COLUMN "memory" SET DEFAULT '[]'::jsonb;
