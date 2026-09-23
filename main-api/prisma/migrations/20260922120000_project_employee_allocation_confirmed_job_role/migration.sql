ALTER TABLE "project_employee_allocations"
  ADD COLUMN "confirmed_job_role_id" uuid;

UPDATE "project_employee_allocations" AS allocation
SET "confirmed_job_role_id" = period."job_role_id"
FROM "employment_job_role_periods" AS period
WHERE allocation."employment_job_role_period_id" = period."id";

ALTER TABLE "project_employee_allocations"
  ADD CONSTRAINT "project_employee_allocations_confirmed_job_role_id_fkey"
  FOREIGN KEY ("confirmed_job_role_id")
  REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "project_employee_allocations_confirmed_job_role_id_idx"
  ON "project_employee_allocations"("confirmed_job_role_id");
