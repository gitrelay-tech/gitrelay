-- Add nullable title column for LLM-generated prompt labels
ALTER TABLE prompt_cache ADD COLUMN IF NOT EXISTS title text;
