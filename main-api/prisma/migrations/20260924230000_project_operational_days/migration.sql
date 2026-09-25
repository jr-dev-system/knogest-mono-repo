CREATE TYPE "project_daily_report_attendance_status" AS ENUM ('PRESENT', 'ABSENT');
CREATE TYPE "project_daily_report_machine_condition" AS ENUM ('FIT', 'UNFIT');
CREATE TYPE "project_daily_report_interference_category" AS ENUM (
  'WEATHER',
  'CREW',
  'EQUIPMENT',
  'MATERIAL_LOGISTICS',
  'EXTERNAL',
  'SAFETY',
  'OTHER'
);

ALTER TABLE "project_daily_reports"
  ADD COLUMN "started_at" timestamptz(3),
  ADD COLUMN "early_closure_reason" varchar(500);

ALTER TABLE "project_daily_report_employees"
  ADD COLUMN "attendance_status" "project_daily_report_attendance_status" NOT NULL DEFAULT 'PRESENT',
  ADD COLUMN "absence_reason" varchar(500),
  ADD COLUMN "check_in_at" timestamptz(3),
  ADD COLUMN "check_out_at" timestamptz(3),
  ADD COLUMN "overtime_confirmed" boolean NOT NULL DEFAULT false;

ALTER TABLE "project_daily_report_machines"
  ADD COLUMN "operational_condition" "project_daily_report_machine_condition" NOT NULL DEFAULT 'FIT',
  ADD COLUMN "condition_note" varchar(500);

CREATE TABLE "project_daily_report_employee_breaks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "daily_report_id" uuid NOT NULL,
  "employee_entry_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "start_at" timestamptz(3) NOT NULL,
  "end_at" timestamptz(3) NOT NULL,
  CONSTRAINT "project_daily_report_employee_breaks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pdreb_entry_fkey" FOREIGN KEY ("employee_entry_id")
    REFERENCES "project_daily_report_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pdreb_entry_position_uq"
  ON "project_daily_report_employee_breaks"("employee_entry_id", "position");
CREATE INDEX "pdreb_scope_idx"
  ON "project_daily_report_employee_breaks"("corporation_id", "company_id", "project_id", "daily_report_id");

CREATE TABLE "project_daily_report_interferences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "corporation_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "daily_report_id" uuid NOT NULL,
  "category" "project_daily_report_interference_category" NOT NULL,
  "description" text NOT NULL,
  "impact" text NOT NULL,
  "started_at" timestamptz(3) NOT NULL,
  "ended_at" timestamptz(3),
  "confirmed_at" timestamptz(3),
  "confirmed_by_user_id" uuid,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL,
  CONSTRAINT "project_daily_report_interferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pdri_report_fkey" FOREIGN KEY ("corporation_id", "company_id", "project_id", "daily_report_id")
    REFERENCES "project_daily_reports"("corporation_id", "company_id", "project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pdri_confirmed_by_fkey" FOREIGN KEY ("corporation_id", "confirmed_by_user_id")
    REFERENCES "users"("corporation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "pdri_scope_started_idx"
  ON "project_daily_report_interferences"("corporation_id", "company_id", "project_id", "daily_report_id", "started_at", "id");
