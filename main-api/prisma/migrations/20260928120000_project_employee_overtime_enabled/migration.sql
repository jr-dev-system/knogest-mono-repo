ALTER TABLE "project_employee_allocations"
ADD COLUMN "overtime_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "project_daily_report_employees"
ADD COLUMN "overtime_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
