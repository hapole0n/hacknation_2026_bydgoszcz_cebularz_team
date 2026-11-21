-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('NAME', 'NICK', 'MESSENGER', 'SOCIAL_LOGIN', 'EMAIL', 'ADDRESS');

-- CreateEnum
CREATE TYPE "AddressCategory" AS ENUM ('UNHOSTED', 'CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CONTRACT', 'DEX', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD', 'MIXER', 'CHARITY', 'SANCTIONED', 'EXAMPLE_BURN', 'UNKNOWN_SERVICE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalystDecision" AS ENUM ('CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('HTML', 'PDF', 'JSON');

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "scheduleCron" TEXT,
    "retentionDays" INTEGER,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Identifier" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "Identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "rulesVersion" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "url" TEXT,
    "resourceId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "sha256" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "archiveUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "metaJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "identifierId" TEXT,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextSnippet" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "category" "AddressCategory" NOT NULL,
    "labelsJson" JSONB NOT NULL DEFAULT '[]',
    "isContract" BOOLEAN,
    "firstSeen" TIMESTAMP(3),
    "lastSeen" TIMESTAMP(3),
    "metaJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "identifierId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "breakdownJson" JSONB NOT NULL,
    "hintsJson" JSONB NOT NULL DEFAULT '[]',
    "excludedReason" TEXT,
    "analystDecision" "AnalystDecision",
    "analystNote" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "indicatorsJson" JSONB NOT NULL,
    "flowsJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "ChainSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunDiff" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromRunId" TEXT NOT NULL,
    "toRunId" TEXT NOT NULL,
    "diffJson" JSONB NOT NULL,

    CONSTRAINT "RunDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" TEXT,
    "runId" TEXT,
    "connectorId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Identifier_caseId_idx" ON "Identifier"("caseId");

-- CreateIndex
CREATE INDEX "Run_caseId_startedAt_idx" ON "Run"("caseId", "startedAt");

-- CreateIndex
CREATE INDEX "Evidence_runId_idx" ON "Evidence"("runId");

-- CreateIndex
CREATE INDEX "Trace_runId_idx" ON "Trace"("runId");

-- CreateIndex
CREATE INDEX "Trace_chain_address_idx" ON "Trace"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Address_chain_address_key" ON "Address"("chain", "address");

-- CreateIndex
CREATE INDEX "Link_addressId_idx" ON "Link"("addressId");

-- CreateIndex
CREATE UNIQUE INDEX "Link_runId_identifierId_addressId_key" ON "Link"("runId", "identifierId", "addressId");

-- CreateIndex
CREATE INDEX "ChainSnapshot_runId_idx" ON "ChainSnapshot"("runId");

-- CreateIndex
CREATE INDEX "ChainSnapshot_addressId_idx" ON "ChainSnapshot"("addressId");

-- CreateIndex
CREATE INDEX "RunDiff_caseId_idx" ON "RunDiff"("caseId");

-- CreateIndex
CREATE INDEX "Notification_caseId_idx" ON "Notification"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "Report_runId_idx" ON "Report"("runId");

-- AddForeignKey
ALTER TABLE "Identifier" ADD CONSTRAINT "Identifier_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_identifierId_fkey" FOREIGN KEY ("identifierId") REFERENCES "Identifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_identifierId_fkey" FOREIGN KEY ("identifierId") REFERENCES "Identifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainSnapshot" ADD CONSTRAINT "ChainSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainSnapshot" ADD CONSTRAINT "ChainSnapshot_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunDiff" ADD CONSTRAINT "RunDiff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunDiff" ADD CONSTRAINT "RunDiff_fromRunId_fkey" FOREIGN KEY ("fromRunId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunDiff" ADD CONSTRAINT "RunDiff_toRunId_fkey" FOREIGN KEY ("toRunId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
