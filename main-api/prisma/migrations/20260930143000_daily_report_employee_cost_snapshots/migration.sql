ALTER TABLE "project_daily_report_employees"
  ADD COLUMN "regular_hourly_rate_snapshot" DECIMAL(18, 4),
  ADD COLUMN "overtime_hourly_rate_snapshot" DECIMAL(18, 4);
