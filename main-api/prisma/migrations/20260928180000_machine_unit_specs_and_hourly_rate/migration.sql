DROP TABLE "machine_ownership_periods";
DROP TYPE "machine_ownership_kind";

ALTER TABLE "project_machine_allocations"
  DROP CONSTRAINT "project_machine_allocation_rental_snapshot_check",
  DROP COLUMN "lessor_name_snapshot",
  DROP COLUMN "hourly_rate_snapshot",
  DROP COLUMN "monthly_hours";

ALTER TABLE "machine_models"
  DROP CONSTRAINT "machine_models_load_capacity_pair_check",
  DROP COLUMN "load_capacity",
  DROP COLUMN "load_capacity_unit_code",
  DROP COLUMN "load_volume_m3",
  DROP COLUMN "max_supported_weight_t";

ALTER TABLE "machines"
  ADD COLUMN "hourly_rate" DECIMAL(18,2),
  ADD COLUMN "load_capacity" DECIMAL(12,3),
  ADD COLUMN "load_capacity_unit_code" VARCHAR(32),
  DROP CONSTRAINT "machines_load_spec_white_line_check";

ALTER TABLE "machines"
  ADD CONSTRAINT "machines_hourly_rate_positive_check"
    CHECK ("hourly_rate" IS NULL OR "hourly_rate" > 0),
  ADD CONSTRAINT "machines_load_capacity_pair_check"
    CHECK (
      ("load_capacity" IS NULL AND "load_capacity_unit_code" IS NULL)
      OR (
        "load_capacity" > 0
        AND "load_capacity_unit_code" IN ('M3_LOOSE', 'M3_COMPACTED', 'LITER', 'CUBIC_YARD')
      )
    ),
  ADD CONSTRAINT "machines_load_spec_white_line_check"
    CHECK (
      "type" = 'WHITE_LINE'
      OR (
        "load_capacity" IS NULL
        AND "load_capacity_unit_code" IS NULL
        AND "load_volume_m3" IS NULL
        AND "max_supported_weight_t" IS NULL
      )
    );
