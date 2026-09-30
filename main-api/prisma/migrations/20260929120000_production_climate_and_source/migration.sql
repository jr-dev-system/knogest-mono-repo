CREATE TYPE "project_production_source" AS ENUM ('PRODUCTION_PAGE', 'OPERATIONAL_CENTER');

ALTER TABLE "project_productions"
ADD COLUMN "source" "project_production_source" NOT NULL DEFAULT 'PRODUCTION_PAGE',
ADD COLUMN "climate_conditions" "project_daily_report_climate_condition"[] NOT NULL DEFAULT ARRAY[]::"project_daily_report_climate_condition"[];
