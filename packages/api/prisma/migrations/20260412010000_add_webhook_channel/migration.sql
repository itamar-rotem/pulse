-- CreateEnum
CREATE TYPE "WebhookChannel" AS ENUM ('CUSTOM', 'SLACK', 'DISCORD');

-- AlterTable: add channel column with default so existing rows stay as CUSTOM
ALTER TABLE "webhooks" ADD COLUMN "channel" "WebhookChannel" NOT NULL DEFAULT 'CUSTOM';
