ALTER TABLE "project_schedule_revisions"
  ADD COLUMN "night_shift_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "project_schedule_revisions" AS revision
SET "night_shift_enabled" = true
WHERE EXISTS (
  SELECT 1
  FROM "project_schedule_days" AS day
  WHERE day."schedule_revision_id" = revision."id"
    AND day."shift" = 'NIGHT'
);
