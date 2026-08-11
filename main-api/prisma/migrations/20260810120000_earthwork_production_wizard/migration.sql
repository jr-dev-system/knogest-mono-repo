CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "project_production_kind" AS ENUM ('INDIVIDUAL_ACTIVITY', 'MATERIAL_MOVEMENT');
CREATE TYPE "project_production_component_type" AS ENUM ('INDIVIDUAL', 'CUT', 'LOADING', 'TRANSPORT', 'UNLOADING', 'SPREADING', 'COMPACTION', 'FILL', 'FINISHING');
CREATE TYPE "project_production_quantity_kind" AS ENUM ('OPERATIONAL', 'ESTIMATED', 'TECHNICALLY_ACCEPTED', 'CONTRACT_MEASURED');
CREATE TYPE "project_production_quantity_method" AS ENUM ('MANUAL', 'TRUCK_SUMMARY', 'TRIP_EVENTS', 'WEIGHBRIDGE', 'CONVERTED', 'TOPOGRAPHY', 'LABORATORY', 'CONTRACT_MEASUREMENT');
CREATE TYPE "project_production_quality_type" AS ENUM ('FIELD_INSPECTION', 'TOPOGRAPHY', 'DENSITY', 'PROCTOR', 'COMPACTION', 'MOISTURE', 'FINISHING');
CREATE TYPE "project_production_quality_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "project_production_approval_phase" AS ENUM ('SUBMISSION', 'FIELD_CHECK', 'TECHNICAL_CHECK', 'RELEASE', 'REOPEN', 'MEASUREMENT');
CREATE TYPE "project_production_approval_decision" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'RELEASED', 'REOPENED', 'MEASURED');
CREATE TYPE "machine_ownership_kind" AS ENUM ('OWNED', 'RENTED', 'THIRD_PARTY');

ALTER TABLE "machine_ownership_periods"
  ADD COLUMN "ownership_kind" "machine_ownership_kind" NOT NULL DEFAULT 'OWNED',
  ADD COLUMN "external_owner_name" VARCHAR(180);

CREATE TABLE "machine_transport_specifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "machine_id" UUID NOT NULL,
  "nominal_capacity" DECIMAL(12,3) NOT NULL,
  "effective_capacity" DECIMAL(12,3) NOT NULL,
  "capacity_unit_code" VARCHAR(32) NOT NULL DEFAULT 'M3_LOOSE',
  "max_supported_weight_t" DECIMAL(12,3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_transport_specifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "machine_transport_specifications_machine_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE,
  CONSTRAINT "machine_transport_specifications_capacity_check" CHECK (
    "nominal_capacity" > 0 AND "effective_capacity" > 0 AND
    ("max_supported_weight_t" IS NULL OR "max_supported_weight_t" > 0)
  )
);
CREATE UNIQUE INDEX "machine_transport_specifications_machine_id_key" ON "machine_transport_specifications"("machine_id");

INSERT INTO "machine_transport_specifications" (
  "machine_id", "nominal_capacity", "effective_capacity", "capacity_unit_code", "max_supported_weight_t"
)
SELECT "id", "load_volume_m3", "load_volume_m3", 'M3_LOOSE', "max_supported_weight_t"
FROM "machines"
WHERE "load_volume_m3" > 0
ON CONFLICT ("machine_id") DO NOTHING;

INSERT INTO "measurement_units" ("id", "corporation_id", "company_id", "code", "name", "is_active", "updated_at")
SELECT gen_random_uuid(), NULL, NULL, unit.code, unit.name, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('M3_BANK', 'Metro cúbico em corte'),
  ('M3_LOOSE', 'Metro cúbico solto'),
  ('M3_COMPACTED', 'Metro cúbico compactado'),
  ('M3_PLACED', 'Metro cúbico aplicado'),
  ('M', 'Metro'),
  ('KM', 'Quilômetro'),
  ('T_KM', 'Tonelada-quilômetro')
) AS unit(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM "measurement_units" existing
  WHERE existing."corporation_id" IS NULL
    AND existing."company_id" IS NULL
    AND existing."code" = unit.code
);

CREATE TABLE "earthwork_service_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(48) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "earthwork_service_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "earthwork_service_definitions_code_key" ON "earthwork_service_definitions"("code");

CREATE TABLE "earthwork_service_definition_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_definition_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "unit_code" VARCHAR(32) NOT NULL,
  "production_profile" "project_production_profile" NOT NULL,
  "dmt_policy" "project_production_dmt_policy" NOT NULL,
  "field_policy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "effective_to" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "earthwork_service_definition_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "earthwork_service_definition_revisions_definition_fkey" FOREIGN KEY ("service_definition_id") REFERENCES "earthwork_service_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "earthwork_service_definition_revisions_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "earthwork_service_definition_revisions_period_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);
CREATE UNIQUE INDEX "earthwork_service_definition_revisions_uq" ON "earthwork_service_definition_revisions"("service_definition_id", "revision");
CREATE INDEX "earthwork_service_definition_revisions_effective_idx" ON "earthwork_service_definition_revisions"("service_definition_id", "effective_from");

INSERT INTO "earthwork_service_definitions" ("code", "name", "updated_at") VALUES
  ('cut', 'Corte', CURRENT_TIMESTAMP),
  ('fill', 'Aterro', CURRENT_TIMESTAMP),
  ('finishing', 'Acabamento', CURRENT_TIMESTAMP),
  ('top_soil', 'Top soil', CURRENT_TIMESTAMP),
  ('unsuitable_soil_removal', 'Remoção de solo impróprio', CURRENT_TIMESTAMP),
  ('replacement_fill', 'Aterro de substituição', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "earthwork_service_definition_revisions" (
  "service_definition_id", "revision", "unit_code", "production_profile", "dmt_policy", "field_policy", "effective_from"
)
SELECT definition."id", 1, seed.unit_code, seed.profile::"project_production_profile", seed.dmt::"project_production_dmt_policy", seed.policy::jsonb, TIMESTAMPTZ '2000-01-01 00:00:00+00'
FROM (VALUES
  ('cut', 'M3_BANK', 'EXCAVATION', 'OPTIONAL', '{"requiresLocation":true,"allowsTransport":true}'),
  ('fill', 'M3_COMPACTED', 'COMPACTION', 'OPTIONAL', '{"requiresLayer":true,"requiresTechnicalAcceptance":true}'),
  ('finishing', 'M2', 'GRADING', 'NOT_APPLICABLE', '{"requiresFinishingCheck":true}'),
  ('top_soil', 'M3_PLACED', 'SPREADING', 'OPTIONAL', '{"requiresMaterialSubtype":true}'),
  ('unsuitable_soil_removal', 'M3_LOOSE', 'TRANSPORT', 'REQUIRED', '{"requiresRoute":true,"requiresTrucks":true}'),
  ('replacement_fill', 'M3_COMPACTED', 'COMPACTION', 'REQUIRED', '{"requiresRoute":true,"requiresLayer":true,"requiresTechnicalAcceptance":true}')
) AS seed(code, unit_code, profile, dmt, policy)
JOIN "earthwork_service_definitions" definition ON definition."code" = seed.code
ON CONFLICT ("service_definition_id", "revision") DO NOTHING;

CREATE TABLE "project_earthwork_materials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "code" VARCHAR(48) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "classification" VARCHAR(120),
  "category" VARCHAR(120),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_earthwork_materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_earthwork_materials_project_fkey" FOREIGN KEY ("corporation_id", "company_id", "project_id") REFERENCES "projects"("corporation_id", "company_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "project_earthwork_materials_code_uq" ON "project_earthwork_materials"("corporation_id", "company_id", "project_id", "code");
CREATE INDEX "project_earthwork_materials_name_idx" ON "project_earthwork_materials"("corporation_id", "company_id", "project_id", "name", "id");

CREATE TABLE "project_earthwork_material_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "material_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "density_t_per_m3" DECIMAL(12,6),
  "swell_factor" DECIMAL(12,6),
  "loose_to_compacted_factor" DECIMAL(12,6),
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "effective_to" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_earthwork_material_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_earthwork_material_revisions_material_fkey" FOREIGN KEY ("material_id") REFERENCES "project_earthwork_materials"("id") ON DELETE CASCADE,
  CONSTRAINT "project_earthwork_material_revisions_values_check" CHECK (
    "revision" > 0 AND
    ("density_t_per_m3" IS NULL OR "density_t_per_m3" > 0) AND
    ("swell_factor" IS NULL OR "swell_factor" > 0) AND
    ("loose_to_compacted_factor" IS NULL OR "loose_to_compacted_factor" > 0) AND
    ("effective_to" IS NULL OR "effective_to" > "effective_from")
  )
);
CREATE UNIQUE INDEX "project_earthwork_material_revisions_uq" ON "project_earthwork_material_revisions"("material_id", "revision");
CREATE INDEX "project_earthwork_material_revisions_effective_idx" ON "project_earthwork_material_revisions"("material_id", "effective_from");
ALTER TABLE "project_earthwork_material_revisions" ADD CONSTRAINT "project_earthwork_material_revisions_no_overlap" EXCLUDE USING gist (
  "material_id" WITH =,
  tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
);

CREATE TABLE "project_haul_routes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "code" VARCHAR(48) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "origin" VARCHAR(240) NOT NULL,
  "destination" VARCHAR(240) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_haul_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_haul_routes_project_fkey" FOREIGN KEY ("corporation_id", "company_id", "project_id") REFERENCES "projects"("corporation_id", "company_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "project_haul_routes_code_uq" ON "project_haul_routes"("corporation_id", "company_id", "project_id", "code");
CREATE INDEX "project_haul_routes_name_idx" ON "project_haul_routes"("corporation_id", "company_id", "project_id", "name", "id");

CREATE TABLE "project_haul_route_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "route_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "loaded_distance_km" DECIMAL(12,3) NOT NULL,
  "empty_return_distance_km" DECIMAL(12,3),
  "contractual_dmt_km" DECIMAL(12,3),
  "contractual_band" VARCHAR(80),
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "effective_to" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_haul_route_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_haul_route_revisions_route_fkey" FOREIGN KEY ("route_id") REFERENCES "project_haul_routes"("id") ON DELETE CASCADE,
  CONSTRAINT "project_haul_route_revisions_values_check" CHECK (
    "revision" > 0 AND "loaded_distance_km" >= 0 AND
    ("empty_return_distance_km" IS NULL OR "empty_return_distance_km" >= 0) AND
    ("contractual_dmt_km" IS NULL OR "contractual_dmt_km" >= 0) AND
    ("effective_to" IS NULL OR "effective_to" > "effective_from")
  )
);
CREATE UNIQUE INDEX "project_haul_route_revisions_uq" ON "project_haul_route_revisions"("route_id", "revision");
CREATE INDEX "project_haul_route_revisions_effective_idx" ON "project_haul_route_revisions"("route_id", "effective_from");
ALTER TABLE "project_haul_route_revisions" ADD CONSTRAINT "project_haul_route_revisions_no_overlap" EXCLUDE USING gist (
  "route_id" WITH =,
  tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
);

ALTER TABLE "project_productions"
  ADD COLUMN "kind" "project_production_kind" NOT NULL DEFAULT 'INDIVIDUAL_ACTIVITY',
  ADD COLUMN "operational_revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "batch_fingerprint" VARCHAR(64);

UPDATE "project_productions" SET "operational_revision" = "revision";
CREATE INDEX "project_productions_shift_workflow_idx" ON "project_productions"("corporation_id", "company_id", "project_id", "production_date", "shift", "status", "kind");
CREATE UNIQUE INDEX "project_productions_batch_fingerprint_uq" ON "project_productions"("corporation_id", "company_id", "project_id", "batch_fingerprint");
ALTER TABLE "project_productions" ADD CONSTRAINT "project_productions_operational_revision_check" CHECK ("operational_revision" > 0 AND "operational_revision" <= "revision");

CREATE TABLE "project_production_individual_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "quantity_method" "project_production_quantity_method" NOT NULL,
  "location" VARCHAR(240),
  "start_station" VARCHAR(80),
  "end_station" VARCHAR(80),
  "layer" VARCHAR(80),
  "elevation" VARCHAR(80),
  "exceptional_from_movement" BOOLEAN NOT NULL DEFAULT false,
  "exception_reason" VARCHAR(500),
  CONSTRAINT "project_production_individual_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_individual_activities_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_individual_activities_exception_check" CHECK (NOT "exceptional_from_movement" OR length(trim(COALESCE("exception_reason", ''))) >= 3)
);
CREATE UNIQUE INDEX "project_production_individual_activities_production_id_key" ON "project_production_individual_activities"("production_id");

CREATE TABLE "project_material_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "material_revision_id" UUID,
  "route_revision_id" UUID,
  "origin" VARCHAR(240) NOT NULL,
  "destination" VARCHAR(240) NOT NULL,
  "layer" VARCHAR(80),
  "material_snapshot" JSONB NOT NULL,
  "route_snapshot" JSONB NOT NULL,
  CONSTRAINT "project_material_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_material_movements_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_material_movements_material_revision_fkey" FOREIGN KEY ("material_revision_id") REFERENCES "project_earthwork_material_revisions"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_material_movements_route_revision_fkey" FOREIGN KEY ("route_revision_id") REFERENCES "project_haul_route_revisions"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_material_movements_route_check" CHECK (trim("origin") <> '' AND trim("destination") <> '' AND lower(trim("origin")) <> lower(trim("destination")))
);
CREATE UNIQUE INDEX "project_material_movements_production_id_key" ON "project_material_movements"("production_id");
CREATE INDEX "project_material_movements_material_revision_idx" ON "project_material_movements"("material_revision_id");
CREATE INDEX "project_material_movements_route_revision_idx" ON "project_material_movements"("route_revision_id");

CREATE FUNCTION "enforce_single_project_production_subtype"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'project_production_individual_activities' AND EXISTS (
    SELECT 1 FROM "project_material_movements" WHERE "production_id" = NEW."production_id"
  ) THEN
    RAISE EXCEPTION 'project production already has a material movement subtype';
  END IF;
  IF TG_TABLE_NAME = 'project_material_movements' AND EXISTS (
    SELECT 1 FROM "project_production_individual_activities" WHERE "production_id" = NEW."production_id"
  ) THEN
    RAISE EXCEPTION 'project production already has an individual activity subtype';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_production_individual_subtype_guard"
BEFORE INSERT OR UPDATE OF "production_id" ON "project_production_individual_activities"
FOR EACH ROW EXECUTE FUNCTION "enforce_single_project_production_subtype"();

CREATE TRIGGER "project_production_movement_subtype_guard"
BEFORE INSERT OR UPDATE OF "production_id" ON "project_material_movements"
FOR EACH ROW EXECUTE FUNCTION "enforce_single_project_production_subtype"();

CREATE TABLE "project_production_components" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "work_front_id" UUID NOT NULL,
  "work_front_service_id" UUID NOT NULL,
  "component_type" "project_production_component_type" NOT NULL,
  "position" INTEGER NOT NULL,
  "service_code_snapshot" VARCHAR(48) NOT NULL,
  "unit_code_snapshot" VARCHAR(32) NOT NULL,
  "volume_condition" "project_production_volume_condition",
  CONSTRAINT "project_production_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_components_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_components_front_fkey" FOREIGN KEY ("work_front_id") REFERENCES "project_work_fronts"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_components_service_fkey" FOREIGN KEY ("work_front_service_id") REFERENCES "project_work_front_services"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_components_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "project_production_components_position_uq" ON "project_production_components"("production_id", "position");
CREATE INDEX "project_production_components_type_idx" ON "project_production_components"("production_id", "component_type");

CREATE TABLE "project_production_quantities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "component_id" UUID NOT NULL,
  "kind" "project_production_quantity_kind" NOT NULL,
  "method" "project_production_quantity_method" NOT NULL,
  "value" DECIMAL(18,3) NOT NULL,
  "unit_code" VARCHAR(32) NOT NULL,
  "volume_condition" "project_production_volume_condition",
  "source_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_production_quantities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_quantities_component_fkey" FOREIGN KEY ("component_id") REFERENCES "project_production_components"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_quantities_value_check" CHECK ("value" >= 0)
);
CREATE UNIQUE INDEX "project_production_quantities_component_kind_uq" ON "project_production_quantities"("component_id", "kind");
CREATE INDEX "project_production_quantities_kind_unit_idx" ON "project_production_quantities"("kind", "unit_code");

CREATE TABLE "project_production_truck_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "machine_id" UUID NOT NULL,
  "driver_employment_id" UUID,
  "driver_name_snapshot" VARCHAR(180),
  "machine_name_snapshot" VARCHAR(160) NOT NULL,
  "identifier_snapshot" VARCHAR(80),
  "capacity_snapshot" DECIMAL(12,3) NOT NULL,
  "capacity_unit_code_snapshot" VARCHAR(32) NOT NULL,
  "accepted_trips" INTEGER NOT NULL,
  "rejected_trips" INTEGER NOT NULL DEFAULT 0,
  "partial_trip_count" INTEGER NOT NULL DEFAULT 0,
  "partial_volume" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "actual_weight_t" DECIMAL(18,3),
  "load_factor" DECIMAL(12,6) NOT NULL DEFAULT 1,
  "average_cycle_minutes" INTEGER,
  "occurrence_notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_production_truck_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_truck_summaries_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_truck_summaries_machine_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_truck_summaries_driver_fkey" FOREIGN KEY ("driver_employment_id") REFERENCES "employments"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_truck_summaries_values_check" CHECK (
    "capacity_snapshot" > 0 AND "accepted_trips" >= 0 AND "rejected_trips" >= 0 AND
    "partial_trip_count" >= 0 AND "partial_trip_count" <= "accepted_trips" AND
    "partial_volume" >= 0 AND ("actual_weight_t" IS NULL OR "actual_weight_t" >= 0) AND
    "load_factor" > 0 AND ("average_cycle_minutes" IS NULL OR "average_cycle_minutes" >= 0)
  )
);
CREATE UNIQUE INDEX "project_production_truck_summaries_machine_uq" ON "project_production_truck_summaries"("production_id", "machine_id");
CREATE INDEX "project_production_truck_summaries_machine_idx" ON "project_production_truck_summaries"("machine_id");

CREATE TABLE "project_production_quality_checks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "type" "project_production_quality_type" NOT NULL,
  "status" "project_production_quality_status" NOT NULL DEFAULT 'PENDING',
  "value" DECIMAL(18,3),
  "unit_code" VARCHAR(32),
  "notes" VARCHAR(500),
  "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "actor_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_production_quality_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_quality_checks_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_quality_checks_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_quality_checks_value_check" CHECK ("value" IS NULL OR "value" >= 0)
);
CREATE INDEX "project_production_quality_checks_type_idx" ON "project_production_quality_checks"("production_id", "type", "created_at");

CREATE TABLE "project_production_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "production_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "phase" "project_production_approval_phase" NOT NULL,
  "decision" "project_production_approval_decision" NOT NULL,
  "reason" VARCHAR(500),
  "snapshot" JSONB NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_production_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_production_approvals_production_fkey" FOREIGN KEY ("production_id") REFERENCES "project_productions"("id") ON DELETE CASCADE,
  CONSTRAINT "project_production_approvals_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_production_approvals_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX "project_production_approvals_created_idx" ON "project_production_approvals"("production_id", "created_at");

ALTER TABLE "project_production_equipment"
  ADD COLUMN "productive_minutes" INTEGER,
  ADD COLUMN "waiting_minutes" INTEGER,
  ADD COLUMN "stopped_minutes" INTEGER;
ALTER TABLE "project_production_equipment" ADD CONSTRAINT "project_production_equipment_time_breakdown_check" CHECK (
  ("productive_minutes" IS NULL OR "productive_minutes" BETWEEN 0 AND 1440) AND
  ("waiting_minutes" IS NULL OR "waiting_minutes" BETWEEN 0 AND 1440) AND
  ("stopped_minutes" IS NULL OR "stopped_minutes" BETWEEN 0 AND 1440)
);

ALTER TABLE "project_daily_report_productions"
  ADD COLUMN "confirmed_operational_revision" INTEGER;
UPDATE "project_daily_report_productions" SET "confirmed_operational_revision" = "confirmed_revision";
ALTER TABLE "project_daily_report_productions" ALTER COLUMN "confirmed_operational_revision" SET NOT NULL;

INSERT INTO "project_production_individual_activities" (
  "production_id", "quantity_method", "location", "start_station", "end_station", "layer", "elevation"
)
SELECT production."id",
  CASE WHEN production."entry_mode" = 'TRIPS' THEN 'TRIP_EVENTS'::"project_production_quantity_method" ELSE 'MANUAL'::"project_production_quantity_method" END,
  production."location", production."start_station", production."end_station", production."layer", production."elevation"
FROM "project_productions" production
ON CONFLICT ("production_id") DO NOTHING;

INSERT INTO "project_production_components" (
  "production_id", "work_front_id", "work_front_service_id", "component_type", "position", "service_code_snapshot", "unit_code_snapshot", "volume_condition"
)
SELECT "id", "work_front_id", "work_front_service_id", 'INDIVIDUAL', 0, "service_code_snapshot", "unit_code_snapshot",
  CASE
    WHEN "volume_condition" = 'CUT' THEN 'BANK'::"project_production_volume_condition"
    WHEN "volume_condition" IS NULL AND UPPER("unit_code_snapshot") = 'M3' AND "service_code_snapshot" IN ('fill', 'replacement_fill') THEN 'COMPACTED'::"project_production_volume_condition"
    WHEN "volume_condition" IS NULL AND UPPER("unit_code_snapshot") = 'M3' AND "service_code_snapshot" = 'top_soil' THEN 'PLACED'::"project_production_volume_condition"
    WHEN "volume_condition" IS NULL AND UPPER("unit_code_snapshot") = 'M3' AND "production_profile_snapshot" = 'EXCAVATION' THEN 'BANK'::"project_production_volume_condition"
    WHEN "volume_condition" IS NULL AND UPPER("unit_code_snapshot") = 'M3' THEN 'LOOSE'::"project_production_volume_condition"
    ELSE "volume_condition"
  END
FROM "project_productions"
ON CONFLICT ("production_id", "position") DO NOTHING;

INSERT INTO "project_production_quantities" (
  "component_id", "kind", "method", "value", "unit_code", "volume_condition", "source_snapshot", "updated_at"
)
SELECT component."id", 'OPERATIONAL',
  CASE WHEN production."entry_mode" = 'TRIPS' THEN 'TRIP_EVENTS'::"project_production_quantity_method" ELSE 'MANUAL'::"project_production_quantity_method" END,
  CASE
    WHEN production."entry_mode" = 'TRIPS' THEN COALESCE(trip.total, 0)
    ELSE COALESCE(production."direct_quantity", 0)
  END,
  CASE
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'CUT' THEN 'M3_BANK'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'LOOSE' THEN 'M3_LOOSE'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'COMPACTED' THEN 'M3_COMPACTED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."service_code_snapshot" IN ('fill', 'replacement_fill') THEN 'M3_COMPACTED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."service_code_snapshot" = 'top_soil' THEN 'M3_PLACED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."production_profile_snapshot" = 'EXCAVATION' THEN 'M3_BANK'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL THEN 'M3_LOOSE'
    ELSE production."unit_code_snapshot"
  END,
  CASE
    WHEN production."volume_condition" = 'CUT' THEN 'BANK'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."service_code_snapshot" IN ('fill', 'replacement_fill') THEN 'COMPACTED'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."service_code_snapshot" = 'top_soil' THEN 'PLACED'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."production_profile_snapshot" = 'EXCAVATION' THEN 'BANK'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' THEN 'LOOSE'::"project_production_volume_condition"
    ELSE production."volume_condition"
  END,
  jsonb_build_object(
    'backfilled', true,
    'legacyUnitCode', production."unit_code_snapshot",
    'volumeConditionInferred', production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3'
  ),
  CURRENT_TIMESTAMP
FROM "project_production_components" component
JOIN "project_productions" production ON production."id" = component."production_id"
LEFT JOIN (
  SELECT "production_id", SUM(COALESCE("adjusted_volume_m3", "capacity_m3")) AS total
  FROM "project_production_trips"
  GROUP BY "production_id"
) trip ON trip."production_id" = production."id"
ON CONFLICT ("component_id", "kind") DO NOTHING;

INSERT INTO "project_production_quantities" (
  "component_id", "kind", "method", "value", "unit_code", "volume_condition", "source_snapshot", "updated_at"
)
SELECT component."id", 'TECHNICALLY_ACCEPTED', 'MANUAL', production."measured_quantity",
  CASE
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'CUT' THEN 'M3_BANK'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'LOOSE' THEN 'M3_LOOSE'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" = 'COMPACTED' THEN 'M3_COMPACTED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."service_code_snapshot" IN ('fill', 'replacement_fill') THEN 'M3_COMPACTED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."service_code_snapshot" = 'top_soil' THEN 'M3_PLACED'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL AND production."production_profile_snapshot" = 'EXCAVATION' THEN 'M3_BANK'
    WHEN UPPER(production."unit_code_snapshot") = 'M3' AND production."volume_condition" IS NULL THEN 'M3_LOOSE'
    ELSE production."unit_code_snapshot"
  END,
  CASE
    WHEN production."volume_condition" = 'CUT' THEN 'BANK'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."service_code_snapshot" IN ('fill', 'replacement_fill') THEN 'COMPACTED'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."service_code_snapshot" = 'top_soil' THEN 'PLACED'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' AND production."production_profile_snapshot" = 'EXCAVATION' THEN 'BANK'::"project_production_volume_condition"
    WHEN production."volume_condition" IS NULL AND UPPER(production."unit_code_snapshot") = 'M3' THEN 'LOOSE'::"project_production_volume_condition"
    ELSE production."volume_condition"
  END,
  jsonb_build_object('backfilled', true, 'legacyMeasuredQuantity', true, 'contractMeasured', false),
  CURRENT_TIMESTAMP
FROM "project_production_components" component
JOIN "project_productions" production ON production."id" = component."production_id"
WHERE production."measured_quantity" IS NOT NULL
ON CONFLICT ("component_id", "kind") DO NOTHING;
