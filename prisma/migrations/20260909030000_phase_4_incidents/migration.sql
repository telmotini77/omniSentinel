CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'CONFIRMED', 'IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE');
CREATE TYPE "IncidentType" AS ENUM ('ONU', 'PON', 'OLT', 'UPLINK', 'NETWORK', 'UNKNOWN');
CREATE TYPE "RootCause" AS ENUM ('ONU_FAILURE', 'ONU_POWER_FAILURE', 'ONU_LOS', 'SIGNAL_DEGRADATION', 'PON_FAILURE', 'OLT_FAILURE', 'UPLINK_FAILURE', 'MULTIPLE_ONU_FAILURE', 'UNKNOWN');

CREATE TABLE "incident_sequences" (
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incident_sequences_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "IncidentType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "source" "AlertSource" NOT NULL,
    "rootCause" "RootCause" NOT NULL DEFAULT 'UNKNOWN',
    "rootCauseConfidence" INTEGER NOT NULL DEFAULT 0,
    "oltExternalId" VARCHAR(150),
    "ponIdentifier" VARCHAR(100),
    "onuSerial" VARCHAR(150),
    "affectedCustomerCount" INTEGER NOT NULL DEFAULT 0,
    "potentialCustomerCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedCustomerCount" INTEGER NOT NULL DEFAULT 0,
    "onlineCustomerCount" INTEGER NOT NULL DEFAULT 0,
    "offlineOnuCount" INTEGER NOT NULL DEFAULT 0,
    "onlineOnuCount" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "assignedUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidentId" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_timelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidentId" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "performedBy" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_timelines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incidents_code_key" ON "incidents"("code");
CREATE INDEX "incidents_status_idx" ON "incidents"("status");
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");
CREATE INDEX "incidents_detectedAt_idx" ON "incidents"("detectedAt");
CREATE INDEX "incidents_oltExternalId_idx" ON "incidents"("oltExternalId");
CREATE INDEX "incidents_ponIdentifier_idx" ON "incidents"("ponIdentifier");
CREATE INDEX "incidents_assignedUserId_idx" ON "incidents"("assignedUserId");
CREATE UNIQUE INDEX "incident_events_alertId_key" ON "incident_events"("alertId");
CREATE INDEX "incident_events_incidentId_occurredAt_idx" ON "incident_events"("incidentId", "occurredAt");
CREATE INDEX "incident_timelines_incidentId_createdAt_idx" ON "incident_timelines"("incidentId", "createdAt");

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incident_timelines" ADD CONSTRAINT "incident_timelines_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
