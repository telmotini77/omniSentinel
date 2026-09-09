CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'MINOR', 'MAJOR', 'CRITICAL', 'DISASTER');
CREATE TYPE "AlertSource" AS ENUM ('ZABBIX', 'SMARTOLT', 'API_ZASMAOLT', 'MANUAL');
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'PROCESSING', 'CORRELATED', 'IGNORED', 'RESOLVED', 'ERROR');

CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "externalEventId" VARCHAR(150) NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "source" "AlertSource" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT,
    "oltExternalId" VARCHAR(150),
    "ponIdentifier" VARCHAR(100),
    "onuSerial" VARCHAR(150),
    "customerCode" VARCHAR(150),
    "payload" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alerts_externalEventId_key" ON "alerts"("externalEventId");
CREATE INDEX "alerts_status_idx" ON "alerts"("status");
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");
CREATE INDEX "alerts_detectedAt_idx" ON "alerts"("detectedAt");
CREATE INDEX "alerts_oltExternalId_idx" ON "alerts"("oltExternalId");
CREATE INDEX "alerts_ponIdentifier_idx" ON "alerts"("ponIdentifier");
CREATE INDEX "alerts_onuSerial_idx" ON "alerts"("onuSerial");
CREATE INDEX "alerts_customerCode_idx" ON "alerts"("customerCode");
CREATE INDEX "alerts_eventType_detectedAt_idx" ON "alerts"("eventType", "detectedAt");
