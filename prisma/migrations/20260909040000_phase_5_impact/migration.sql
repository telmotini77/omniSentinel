CREATE TYPE "CustomerConnectionStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

CREATE TABLE "incident_customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidentId" UUID NOT NULL,
    "externalCustomerId" VARCHAR(150) NOT NULL,
    "customerCode" VARCHAR(150),
    "customerName" VARCHAR(255),
    "onuSerial" VARCHAR(150),
    "servicePlan" VARCHAR(150),
    "serviceType" VARCHAR(150),
    "initialStatus" "CustomerConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "currentStatus" "CustomerConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rxPowerBefore" DOUBLE PRECISION,
    "rxPowerDuring" DOUBLE PRECISION,
    "rxPowerAfter" DOUBLE PRECISION,
    "affectedFrom" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "impactDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "confirmedAffected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incident_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incident_customers_incidentId_externalCustomerId_key" ON "incident_customers"("incidentId", "externalCustomerId");
CREATE INDEX "incident_customers_customerCode_idx" ON "incident_customers"("customerCode");
CREATE INDEX "incident_customers_onuSerial_idx" ON "incident_customers"("onuSerial");
CREATE INDEX "incident_customers_currentStatus_idx" ON "incident_customers"("currentStatus");
CREATE INDEX "incident_customers_incidentId_confirmedAffected_idx" ON "incident_customers"("incidentId", "confirmedAffected");

ALTER TABLE "incident_customers" ADD CONSTRAINT "incident_customers_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
