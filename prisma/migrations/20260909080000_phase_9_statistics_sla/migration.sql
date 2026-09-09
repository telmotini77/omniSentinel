CREATE TYPE "SlaScope" AS ENUM ('GLOBAL', 'OLT', 'PON', 'CUSTOMER');

CREATE TABLE "sla_records" (
    "id" UUID NOT NULL,
    "scope" "SlaScope" NOT NULL,
    "scopeKey" VARCHAR(255) NOT NULL DEFAULT 'GLOBAL',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalMinutes" DOUBLE PRECISION NOT NULL,
    "downtimeMinutes" DOUBLE PRECISION NOT NULL,
    "availabilityPercentage" DOUBLE PRECISION NOT NULL,
    "incidentCount" INTEGER NOT NULL,
    "mttrMinutes" DOUBLE PRECISION,
    "mtbfMinutes" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sla_records_scope_scopeKey_periodStart_periodEnd_key"
  ON "sla_records"("scope", "scopeKey", "periodStart", "periodEnd");
CREATE INDEX "sla_records_scope_scopeKey_calculatedAt_idx"
  ON "sla_records"("scope", "scopeKey", "calculatedAt");
CREATE INDEX "sla_records_periodStart_periodEnd_idx"
  ON "sla_records"("periodStart", "periodEnd");
