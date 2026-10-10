ALTER TABLE reviews ADD COLUMN IF NOT EXISTS adjusted_score numeric CHECK(adjusted_score BETWEEN 0 AND 100);
