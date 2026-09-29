ALTER TABLE "project_work_fronts"
DROP CONSTRAINT IF EXISTS "pwf_resource_requirement_check";

UPDATE "project_work_fronts"
SET "requires_employees" = FALSE, "requires_machines" = FALSE;

ALTER TABLE "project_work_fronts"
ALTER COLUMN "requires_employees" SET DEFAULT FALSE,
ALTER COLUMN "requires_machines" SET DEFAULT FALSE;

ALTER TABLE "project_work_front_employee_assignments"
DROP CONSTRAINT IF EXISTS "pwfea_closed_audit_shape";

ALTER TABLE "project_work_front_employee_assignments"
ADD CONSTRAINT "pwfea_closed_audit_shape" CHECK (
  ("effective_to" IS NULL AND "ended_by_user_id" IS NULL AND "ended_reason" IS NULL)
  OR ("effective_to" IS NOT NULL AND "ended_reason" IS NOT NULL
    AND ("ended_by_user_id" IS NOT NULL OR "ended_reason" = 'Destinação por frente descontinuada'))
);

ALTER TABLE "project_work_front_machine_assignments"
DROP CONSTRAINT IF EXISTS "pwfma_closed_audit_shape";

ALTER TABLE "project_work_front_machine_assignments"
ADD CONSTRAINT "pwfma_closed_audit_shape" CHECK (
  ("effective_to" IS NULL AND "ended_by_user_id" IS NULL AND "ended_reason" IS NULL)
  OR ("effective_to" IS NOT NULL AND "ended_reason" IS NOT NULL
    AND ("ended_by_user_id" IS NOT NULL OR "ended_reason" = 'Destinação por frente descontinuada'))
);

UPDATE "project_work_front_employee_assignments"
SET "effective_to" = NOW(), "ended_reason" = 'Destinação por frente descontinuada'
WHERE "effective_to" IS NULL;

UPDATE "project_work_front_machine_assignments"
SET "effective_to" = NOW(), "ended_reason" = 'Destinação por frente descontinuada'
WHERE "effective_to" IS NULL;
