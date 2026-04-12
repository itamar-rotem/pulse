-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "user_name" TEXT;

-- CreateIndex (for per-user analytics grouping)
CREATE INDEX "sessions_user_name_idx" ON "sessions"("user_name") WHERE "user_name" IS NOT NULL;
