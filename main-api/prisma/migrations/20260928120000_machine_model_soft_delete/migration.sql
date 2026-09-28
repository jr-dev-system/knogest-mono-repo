ALTER TABLE "machine_models"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_by_user_id" UUID;

ALTER TABLE "machine_models"
  ADD CONSTRAINT "machine_models_deleted_by_user_fkey"
  FOREIGN KEY ("corporation_id", "deleted_by_user_id")
  REFERENCES "users"("corporation_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
