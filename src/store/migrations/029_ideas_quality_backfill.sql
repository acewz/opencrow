-- Backfill NULL quality_score to 1 (unscored ideas default to lowest)
UPDATE generated_ideas SET quality_score = 1 WHERE quality_score IS NULL;

-- Set default so future inserts without a score get 1 instead of NULL
ALTER TABLE generated_ideas ALTER COLUMN quality_score SET DEFAULT 1;
