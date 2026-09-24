ALTER TABLE "machine_models"
ADD COLUMN "load_capacity" DECIMAL(12,3),
ADD COLUMN "load_capacity_unit_code" VARCHAR(32);

UPDATE "machine_models"
SET
  "load_capacity" = "load_volume_m3",
  "load_capacity_unit_code" = 'M3_LOOSE'
WHERE "load_volume_m3" IS NOT NULL;

ALTER TABLE "machine_models"
ADD CONSTRAINT "machine_models_load_capacity_pair_check"
CHECK (
  ("load_capacity" IS NULL AND "load_capacity_unit_code" IS NULL)
  OR
  (
    "load_capacity" > 0
    AND "load_capacity_unit_code" IN ('M3_LOOSE', 'M3_COMPACTED', 'LITER', 'CUBIC_YARD')
  )
);
