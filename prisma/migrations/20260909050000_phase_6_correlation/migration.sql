ALTER TABLE "incidents" ADD COLUMN "correlationKey" VARCHAR(255);

CREATE TABLE "correlation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "eventPattern" VARCHAR(120) NOT NULL DEFAULT '*',
    "minimumEventCount" INTEGER,
    "minimumDistinctOnus" INTEGER,
    "minimumAffectedCustomers" INTEGER,
    "incidentType" "IncidentType",
    "rootCause" "RootCause",
    "rootCauseConfidence" INTEGER,
    "severity" "AlertSeverity",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "correlation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "correlation_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alertId" UUID NOT NULL,
    "incidentId" UUID,
    "correlationRuleId" UUID,
    "correlationKey" VARCHAR(255) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "distinctOnuCount" INTEGER NOT NULL DEFAULT 0,
    "affectedCustomerCount" INTEGER NOT NULL DEFAULT 0,
    "rootCause" "RootCause" NOT NULL DEFAULT 'UNKNOWN',
    "rootCauseConfidence" INTEGER NOT NULL DEFAULT 0,
    "severity" "AlertSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "correlation_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correlation_rules_name_key" ON "correlation_rules"("name");
CREATE INDEX "correlation_rules_enabled_priority_idx" ON "correlation_rules"("enabled", "priority");
CREATE UNIQUE INDEX "correlation_results_alertId_key" ON "correlation_results"("alertId");
CREATE INDEX "correlation_results_incidentId_createdAt_idx" ON "correlation_results"("incidentId", "createdAt");
CREATE INDEX "correlation_results_correlationKey_createdAt_idx" ON "correlation_results"("correlationKey", "createdAt");
CREATE INDEX "correlation_results_correlationRuleId_idx" ON "correlation_results"("correlationRuleId");
CREATE INDEX "incidents_correlationKey_status_detectedAt_idx" ON "incidents"("correlationKey", "status", "detectedAt");

ALTER TABLE "correlation_results" ADD CONSTRAINT "correlation_results_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "correlation_results" ADD CONSTRAINT "correlation_results_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "correlation_results" ADD CONSTRAINT "correlation_results_correlationRuleId_fkey" FOREIGN KEY ("correlationRuleId") REFERENCES "correlation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "correlation_rules" (
  "id", "name", "description", "priority", "eventPattern", "minimumDistinctOnus", "minimumAffectedCustomers", "incidentType", "rootCause", "rootCauseConfidence", "severity", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000601', 'multiple-onu-on-a-pon', 'Ten distinct ONU offline events on the same PON within the correlation window.', 10, 'onu.offline', 10, NULL, 'PON', 'MULTIPLE_ONU_FAILURE', 85, 'CRITICAL', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000602', 'olt-down', 'An OLT down event is a disaster-level OLT failure.', 20, 'olt.down', NULL, NULL, 'OLT', 'OLT_FAILURE', 95, 'DISASTER', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000603', 'pon-down', 'A PON down event is a critical PON failure.', 20, 'pon.down', NULL, NULL, 'PON', 'PON_FAILURE', 91, 'CRITICAL', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000604', 'uplink-down', 'An uplink down event is a critical uplink failure.', 20, 'uplink.down', NULL, NULL, 'UPLINK', 'UPLINK_FAILURE', 88, 'CRITICAL', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000605', 'onu-los', 'A LOS event identifies an ONU optical-loss condition.', 30, 'onu.los', NULL, NULL, 'ONU', 'ONU_LOS', 82, 'MAJOR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000606', 'onu-power-failure', 'An ONU power event identifies a power failure.', 30, 'onu.power_fail', NULL, NULL, 'ONU', 'ONU_POWER_FAILURE', 80, 'MAJOR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000607', 'signal-critical', 'Critical optical signal events are signal degradation.', 30, 'onu.signal.critical', NULL, NULL, 'ONU', 'SIGNAL_DEGRADATION', 75, 'CRITICAL', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000608', 'signal-warning', 'Warning optical signal events are signal degradation.', 30, 'onu.signal.warning', NULL, NULL, 'ONU', 'SIGNAL_DEGRADATION', 65, 'WARNING', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000609', 'single-onu-offline', 'An isolated ONU offline event is an ONU failure.', 100, 'onu.offline', NULL, NULL, 'ONU', 'ONU_FAILURE', 60, 'MINOR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000610', 'impact-disaster', 'Escalate any incident affecting 51 or more customers.', 200, '*', NULL, 51, NULL, NULL, NULL, 'DISASTER', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000611', 'impact-critical', 'Escalate any incident affecting 11 to 50 customers.', 210, '*', NULL, 11, NULL, NULL, NULL, 'CRITICAL', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000612', 'impact-major', 'Escalate any incident affecting 2 to 10 customers.', 220, '*', NULL, 2, NULL, NULL, NULL, 'MAJOR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000613', 'impact-minor', 'Escalate any incident affecting one customer.', 230, '*', NULL, 1, NULL, NULL, NULL, 'MINOR', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
