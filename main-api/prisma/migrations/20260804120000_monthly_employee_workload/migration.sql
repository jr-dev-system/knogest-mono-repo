ALTER TABLE "project_employee_allocations"
  RENAME COLUMN "expected_daily_workload_minutes" TO "monthly_workload_hours";

UPDATE "project_employee_allocations"
SET "monthly_workload_hours" = 220;

ALTER TABLE "project_employee_allocations"
  DROP CONSTRAINT IF EXISTS "project_employee_allocations_expected_daily_workload_minutes_check";

ALTER TABLE "project_employee_allocations"
  ADD CONSTRAINT "project_employee_allocations_monthly_workload_hours_check"
  CHECK ("monthly_workload_hours" BETWEEN 1 AND 744);

ALTER TABLE "project_employee_allocations"
  ALTER COLUMN "monthly_workload_hours" SET DEFAULT 220;

ALTER TABLE "project_daily_report_employees"
  DROP CONSTRAINT "pdre_full_shift_check",
  DROP CONSTRAINT "pdre_minutes_check";

ALTER TABLE "project_daily_report_employees"
  DROP COLUMN "expected_daily_workload_minutes";

ALTER TABLE "project_daily_report_employees"
  ADD CONSTRAINT "pdre_minutes_check"
  CHECK (
    "regular_worked_minutes" BETWEEN 0 AND 1440
    AND "overtime_minutes" BETWEEN 0 AND 1440
    AND "regular_worked_minutes" + "overtime_minutes" <= 1440
  );
