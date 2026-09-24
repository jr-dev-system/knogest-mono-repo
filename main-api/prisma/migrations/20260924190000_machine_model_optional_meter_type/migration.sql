-- Meter type belongs to each physical unit. Catalog models created without
-- units must therefore allow this legacy column to remain empty.
ALTER TABLE "machine_models"
ALTER COLUMN "meter_type" DROP NOT NULL;
