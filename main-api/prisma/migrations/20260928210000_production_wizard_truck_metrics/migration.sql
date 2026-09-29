CREATE TYPE "project_production_destination_kind" AS ENUM ('FILL', 'DISPOSAL', 'OTHER');

ALTER TABLE "project_production_individual_activities"
ADD COLUMN "destination_kind" "project_production_destination_kind",
ADD COLUMN "destination_work_front_id" UUID,
ADD COLUMN "compaction_reduction_percent" DECIMAL(5, 2);

ALTER TABLE "project_production_truck_summaries"
ADD COLUMN "average_loading_minutes" DECIMAL(6, 2),
ADD COLUMN "average_unloading_minutes" DECIMAL(6, 2),
ADD COLUMN "dmt_km" DECIMAL(10, 3);
