CREATE TYPE "project_daily_report_live_status" AS ENUM ('WORKING', 'PAUSED');
CREATE TYPE "project_daily_report_resource_status" AS ENUM ('WORKING', 'STOPPED', 'MAINTENANCE', 'UNFIT');
CREATE TYPE "project_daily_report_status_event_type" AS ENUM ('SHIFT', 'EMPLOYEE', 'MACHINE');

ALTER TABLE "project_daily_reports"
  ADD COLUMN "live_status" "project_daily_report_live_status";

ALTER TABLE "project_daily_report_employees"
  ADD COLUMN "live_status" "project_daily_report_resource_status";

ALTER TABLE "project_daily_report_machines"
  ADD COLUMN "live_status" "project_daily_report_resource_status";

UPDATE "project_daily_reports"
SET "live_status" = 'WORKING'
WHERE "status" = 'DRAFT' AND "started_at" IS NOT NULL;

UPDATE "project_daily_report_employees" AS employee
SET "live_status" = CASE
  WHEN employee."attendance_status" = 'PRESENT' THEN 'WORKING'::"project_daily_report_resource_status"
  ELSE 'STOPPED'::"project_daily_report_resource_status"
END
FROM "project_daily_reports" AS report
WHERE employee."daily_report_id" = report."id"
  AND report."status" = 'DRAFT'
  AND report."started_at" IS NOT NULL;

UPDATE "project_daily_report_machines" AS machine
SET "live_status" = CASE
  WHEN machine."operational_condition" = 'FIT' THEN 'WORKING'::"project_daily_report_resource_status"
  ELSE 'UNFIT'::"project_daily_report_resource_status"
END
FROM "project_daily_reports" AS report
WHERE machine."daily_report_id" = report."id"
  AND report."status" = 'DRAFT'
  AND report."started_at" IS NOT NULL;

CREATE TABLE "project_daily_report_status_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "daily_report_id" uuid NOT NULL,
  "employee_entry_id" uuid,
  "machine_entry_id" uuid,
  "type" "project_daily_report_status_event_type" NOT NULL,
  "from_status" varchar(20),
  "to_status" varchar(20) NOT NULL,
  "occurred_at" timestamptz(3) NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_daily_report_status_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pdrse_report_fkey" FOREIGN KEY ("corporation_id", "company_id", "project_id", "daily_report_id")
    REFERENCES "project_daily_reports"("corporation_id", "company_id", "project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pdrse_employee_fkey" FOREIGN KEY ("employee_entry_id")
    REFERENCES "project_daily_report_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pdrse_machine_fkey" FOREIGN KEY ("machine_entry_id")
    REFERENCES "project_daily_report_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pdrse_actor_fkey" FOREIGN KEY ("corporation_id", "actor_user_id")
    REFERENCES "users"("corporation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pdrse_target_check" CHECK (
    ("type" = 'SHIFT' AND "employee_entry_id" IS NULL AND "machine_entry_id" IS NULL) OR
    ("type" = 'EMPLOYEE' AND "employee_entry_id" IS NOT NULL AND "machine_entry_id" IS NULL) OR
    ("type" = 'MACHINE' AND "employee_entry_id" IS NULL AND "machine_entry_id" IS NOT NULL)
  )
);

CREATE INDEX "pdrse_report_occurred_idx"
  ON "project_daily_report_status_events"("corporation_id", "company_id", "project_id", "daily_report_id", "occurred_at", "id");
CREATE INDEX "pdrse_employee_occurred_idx"
  ON "project_daily_report_status_events"("daily_report_id", "employee_entry_id", "occurred_at", "id");
CREATE INDEX "pdrse_machine_occurred_idx"
  ON "project_daily_report_status_events"("daily_report_id", "machine_entry_id", "occurred_at", "id");
