-- AlterTable
ALTER TABLE "Case" DROP COLUMN "scheduleCron",
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "scheduleEveryMin" INTEGER;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manual';
