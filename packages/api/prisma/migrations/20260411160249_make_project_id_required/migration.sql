/*
  Warnings:

  - Made the column `project_id` on table `sessions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `project_id` on table `token_events` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_project_id_fkey";

-- DropForeignKey
ALTER TABLE "token_events" DROP CONSTRAINT "token_events_project_id_fkey";

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "project_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "token_events" ALTER COLUMN "project_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_events" ADD CONSTRAINT "token_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
