/*
  Warnings:

  - Made the column `org_id` on table `alerts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `org_id` on table `insights` required. This step will fail if there are existing NULL values in that column.
  - Made the column `org_id` on table `rules` required. This step will fail if there are existing NULL values in that column.
  - Made the column `org_id` on table `sessions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `org_id` on table `token_events` required. This step will fail if there are existing NULL values in that column.
  - Made the column `org_id` on table `webhooks` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_org_id_fkey";

-- DropForeignKey
ALTER TABLE "insights" DROP CONSTRAINT "insights_org_id_fkey";

-- DropForeignKey
ALTER TABLE "rules" DROP CONSTRAINT "rules_org_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_org_id_fkey";

-- DropForeignKey
ALTER TABLE "token_events" DROP CONSTRAINT "token_events_org_id_fkey";

-- DropForeignKey
ALTER TABLE "webhooks" DROP CONSTRAINT "webhooks_org_id_fkey";

-- AlterTable
ALTER TABLE "alerts" ALTER COLUMN "org_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "insights" ALTER COLUMN "org_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "rules" ALTER COLUMN "org_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "org_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "token_events" ALTER COLUMN "org_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "webhooks" ALTER COLUMN "org_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
