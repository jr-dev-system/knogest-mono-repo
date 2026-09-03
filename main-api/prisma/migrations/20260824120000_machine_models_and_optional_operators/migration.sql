CREATE TABLE "machine_models" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "description" VARCHAR(500),
  "type" "machine_type" NOT NULL,
  "manufacturer" VARCHAR(120) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "meter_type" "machine_meter_type" NOT NULL,
  "load_volume_m3" DECIMAL(10,3),
  "max_supported_weight_t" DECIMAL(10,3),
  "requires_operator" BOOLEAN NOT NULL DEFAULT true,
  "required_job_role_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "machine_models_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "machines" ADD COLUMN "machine_model_id" UUID;

INSERT INTO "job_roles" (
  "corporation_id", "company_id", "name", "normalized_name", "is_active", "updated_at"
)
SELECT DISTINCT ownership."corporation_id", ownership."company_id", 'Qualquer um', 'qualquer um', true, CURRENT_TIMESTAMP
FROM "machine_ownership_periods" ownership
ON CONFLICT ("corporation_id", "company_id", "normalized_name") DO NOTHING;

WITH ownership_source AS (
  SELECT DISTINCT ON ("corporation_id", "machine_id")
    "corporation_id", "company_id", "machine_id"
  FROM "machine_ownership_periods"
  ORDER BY "corporation_id", "machine_id", ("effective_to" IS NULL) DESC, "effective_from" DESC
), grouped_models AS (
  SELECT
    ownership."corporation_id",
    ownership."company_id",
    machine."description",
    machine."type",
    machine."manufacturer",
    machine."model",
    machine."meter_type",
    machine."load_volume_m3",
    machine."max_supported_weight_t",
    MIN(machine."created_at") AS "created_at"
  FROM "machines" machine
  JOIN ownership_source ownership
    ON ownership."corporation_id" = machine."corporation_id"
   AND ownership."machine_id" = machine."id"
  GROUP BY
    ownership."corporation_id", ownership."company_id", machine."description", machine."type",
    machine."manufacturer", machine."model", machine."meter_type", machine."load_volume_m3", machine."max_supported_weight_t"
)
INSERT INTO "machine_models" (
  "corporation_id", "company_id", "description", "type", "manufacturer", "model", "meter_type",
  "load_volume_m3", "max_supported_weight_t", "requires_operator", "required_job_role_id", "created_at", "updated_at"
)
SELECT
  grouped."corporation_id", grouped."company_id", grouped."description", grouped."type", grouped."manufacturer",
  grouped."model", grouped."meter_type", grouped."load_volume_m3", grouped."max_supported_weight_t", true,
  role."id", grouped."created_at", CURRENT_TIMESTAMP
FROM grouped_models grouped
JOIN "job_roles" role
  ON role."corporation_id" = grouped."corporation_id"
 AND role."company_id" = grouped."company_id"
 AND role."normalized_name" = 'qualquer um';

UPDATE "machines" machine
SET "machine_model_id" = model."id"
FROM (
  SELECT DISTINCT ON ("corporation_id", "machine_id")
    "corporation_id", "company_id", "machine_id"
  FROM "machine_ownership_periods"
  ORDER BY "corporation_id", "machine_id", ("effective_to" IS NULL) DESC, "effective_from" DESC
) ownership, "machine_models" model
WHERE ownership."corporation_id" = machine."corporation_id"
  AND ownership."machine_id" = machine."id"
  AND model."corporation_id" = ownership."corporation_id"
  AND model."company_id" = ownership."company_id"
  AND model."description" IS NOT DISTINCT FROM machine."description"
  AND model."type" = machine."type"
  AND model."manufacturer" = machine."manufacturer"
  AND model."model" = machine."model"
  AND model."meter_type" = machine."meter_type"
  AND model."load_volume_m3" IS NOT DISTINCT FROM machine."load_volume_m3"
  AND model."max_supported_weight_t" IS NOT DISTINCT FROM machine."max_supported_weight_t";

ALTER TABLE "machines" ALTER COLUMN "machine_model_id" SET NOT NULL;
ALTER TABLE "machines" ADD CONSTRAINT "machines_machine_model_id_fkey"
  FOREIGN KEY ("machine_model_id") REFERENCES "machine_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "machines_machine_model_id_idx" ON "machines"("machine_model_id");
CREATE INDEX "machine_models_corporation_id_company_id_manufacturer_model_id_idx"
  ON "machine_models"("corporation_id", "company_id", "manufacturer", "model", "id");
CREATE INDEX "machine_models_corporation_id_company_id_required_job_role_id_idx"
  ON "machine_models"("corporation_id", "company_id", "required_job_role_id");

ALTER TABLE "machine_models" ADD CONSTRAINT "machine_models_corporation_id_fkey"
  FOREIGN KEY ("corporation_id") REFERENCES "corporations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "machine_models" ADD CONSTRAINT "machine_models_corporation_id_company_id_fkey"
  FOREIGN KEY ("corporation_id", "company_id") REFERENCES "companies"("corporation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "machine_models" ADD CONSTRAINT "machine_models_required_job_role_id_fkey"
  FOREIGN KEY ("required_job_role_id") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_machine_allocations" ALTER COLUMN "operator_employment_id" DROP NOT NULL;
ALTER TABLE "project_machine_shift_assignments" ALTER COLUMN "operator_employment_id" DROP NOT NULL;
ALTER TABLE "project_work_front_machine_assignments" ALTER COLUMN "operator_employment_id" DROP NOT NULL;
