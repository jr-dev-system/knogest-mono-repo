-- Reconcile databases where the production wizard migration was recorded
-- before its final columns and decimal duration types were defined.
ALTER TABLE "project_production_individual_activities"
ADD COLUMN IF NOT EXISTS "compaction_reduction_percent" DECIMAL(5, 2);

ALTER TABLE "project_production_truck_summaries"
ALTER COLUMN "average_loading_minutes" TYPE DECIMAL(6, 2)
USING "average_loading_minutes"::DECIMAL(6, 2),
ALTER COLUMN "average_unloading_minutes" TYPE DECIMAL(6, 2)
USING "average_unloading_minutes"::DECIMAL(6, 2);
