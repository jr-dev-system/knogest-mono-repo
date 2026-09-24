ALTER TYPE "machine_meter_reading_purpose" ADD VALUE IF NOT EXISTS 'RESTORATION';

ALTER TABLE "machine_models"
  ADD COLUMN "version" VARCHAR(120),
  ADD COLUMN "normalized_manufacturer" VARCHAR(120),
  ADD COLUMN "normalized_model" VARCHAR(120),
  ADD COLUMN "normalized_version" VARCHAR(120) NOT NULL DEFAULT '';

UPDATE "machine_models"
SET
  "normalized_manufacturer" = lower(regexp_replace(trim("manufacturer"), '\\s+', ' ', 'g')),
  "normalized_model" = lower(regexp_replace(trim("model"), '\\s+', ' ', 'g')),
  "normalized_version" = coalesce(lower(regexp_replace(trim("version"), '\\s+', ' ', 'g')), '');

ALTER TABLE "machine_models"
  ALTER COLUMN "normalized_manufacturer" SET NOT NULL,
  ALTER COLUMN "normalized_model" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "machine_models"
    WHERE "is_active"
    GROUP BY "corporation_id", "company_id", "normalized_manufacturer", "normalized_model", "normalized_version"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique machine model catalog key: duplicated active manufacturer/model/version rows exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "machine_models_corporation_id_company_id_manufacturer_model_id_idx";
CREATE INDEX "machine_models_catalog_lookup_idx"
  ON "machine_models"("corporation_id", "company_id", "manufacturer", "model", "version", "id");
CREATE UNIQUE INDEX "machine_models_active_catalog_unique"
  ON "machine_models"("corporation_id", "company_id", "normalized_manufacturer", "normalized_model", "normalized_version")
  WHERE "is_active";

ALTER TABLE "machines"
  ADD COLUMN "version" VARCHAR(120),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_by_user_id" UUID;

UPDATE "machines" AS machine
SET "version" = model."version"
FROM "machine_models" AS model
WHERE model."id" = machine."machine_model_id";

ALTER TABLE "machines"
  ADD CONSTRAINT "machines_deleted_by_user_fkey"
  FOREIGN KEY ("corporation_id", "deleted_by_user_id") REFERENCES "users"("corporation_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "machine_ownership_periods"
  ADD COLUMN "suggested_hourly_rate" DECIMAL(18,2),
  ADD CONSTRAINT "machine_rental_terms_check"
  CHECK (
    ("ownership_kind" <> 'RENTED') OR
    ("external_owner_name" IS NOT NULL AND length(trim("external_owner_name")) > 0 AND "suggested_hourly_rate" > 0)
  );

ALTER TABLE "project_machine_allocations"
  ADD COLUMN "lessor_name_snapshot" VARCHAR(180),
  ADD COLUMN "hourly_rate_snapshot" DECIMAL(18,2),
  ADD COLUMN "monthly_hours" INTEGER,
  ADD CONSTRAINT "project_machine_allocation_rental_snapshot_check"
  CHECK (
    ("lessor_name_snapshot" IS NULL AND "hourly_rate_snapshot" IS NULL AND "monthly_hours" IS NULL) OR
    ("lessor_name_snapshot" IS NOT NULL AND length(trim("lessor_name_snapshot")) > 0 AND "hourly_rate_snapshot" > 0 AND "monthly_hours" BETWEEN 1 AND 744)
  );
