CREATE TYPE "ReportType" AS ENUM (
  'INCIDENT_REPORT', 'CUSTOMER_IMPACT_REPORT', 'OLT_REPORT', 'PON_REPORT',
  'CUSTOMER_REPORT', 'DAILY_REPORT', 'WEEKLY_REPORT', 'MONTHLY_REPORT',
  'SLA_REPORT', 'AVAILABILITY_REPORT', 'OUTAGE_REPORT'
);
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX', 'CSV', 'JSON');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "incidentId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "fileName" VARCHAR(255),
    "filePath" VARCHAR(1000),
    "fileSize" INTEGER,
    "generatedBy" VARCHAR(150),
    "generatedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");
CREATE INDEX "reports_type_format_idx" ON "reports"("type", "format");
CREATE INDEX "reports_incidentId_createdAt_idx" ON "reports"("incidentId", "createdAt");
CREATE INDEX "reports_generatedAt_idx" ON "reports"("generatedAt");

ALTER TABLE "reports" ADD CONSTRAINT "reports_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
