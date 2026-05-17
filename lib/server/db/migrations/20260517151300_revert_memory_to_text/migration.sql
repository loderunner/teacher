-- Revert memory column from text[] back to text.
-- The column was migrated to text[] on the database without a corresponding
-- code change being pushed. This migration restores the text type so the
-- application code can function again. The laptop branch that introduced the
-- text[] change can apply a fresh migration on top of this one once it lands.
ALTER TABLE "journeys" ALTER COLUMN "memory" TYPE text USING array_to_string(memory, E'\n');--> statement-breakpoint
ALTER TABLE "journeys" ALTER COLUMN "memory" SET DEFAULT '';
