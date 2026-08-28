ALTER TABLE "education"
  ADD COLUMN IF NOT EXISTS "start_date" timestamp,
  ADD COLUMN IF NOT EXISTS "end_date" timestamp,
  ADD COLUMN IF NOT EXISTS "is_current" boolean DEFAULT false;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "start_date" timestamp,
  ADD COLUMN IF NOT EXISTS "end_date" timestamp,
  ADD COLUMN IF NOT EXISTS "is_current" boolean DEFAULT false;

ALTER TABLE "experiences"
  ADD COLUMN IF NOT EXISTS "start_date" timestamp,
  ADD COLUMN IF NOT EXISTS "end_date" timestamp,
  ADD COLUMN IF NOT EXISTS "is_current" boolean DEFAULT false;
