-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "message",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paramsJson" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");
