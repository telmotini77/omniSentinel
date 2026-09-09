CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WEBHOOK');
CREATE TYPE "NotificationEvent" AS ENUM (
  'INCIDENT_CREATED', 'INCIDENT_CORRELATED', 'INCIDENT_RECOVERY_DETECTED',
  'INCIDENT_RESOLVED', 'INCIDENT_CLOSED'
);
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "minimumSeverity" "AlertSeverity" NOT NULL DEFAULT 'MAJOR',
    "destination" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ruleId" UUID,
    "incidentId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "destination" VARCHAR(1000) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "deliveryMetadata" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_rules_name_key" ON "notification_rules"("name");
CREATE INDEX "notification_rules_enabled_event_minimumSeverity_idx" ON "notification_rules"("enabled", "event", "minimumSeverity");
CREATE INDEX "notifications_incidentId_createdAt_idx" ON "notifications"("incidentId", "createdAt");
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");
CREATE INDEX "notifications_ruleId_idx" ON "notifications"("ruleId");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "notification_rules" (
  "id", "name", "description", "enabled", "event", "channel", "minimumSeverity", "destination", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000701', 'major-incident-email', 'Email notification for major or higher incident creation. Configure a destination and enable it.', false, 'INCIDENT_CREATED', 'EMAIL', 'MAJOR', NULL, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000702', 'critical-incident-webhook', 'Webhook notification for critical or disaster incident creation. Configure a destination and enable it.', false, 'INCIDENT_CREATED', 'WEBHOOK', 'CRITICAL', NULL, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000703', 'incident-recovery-email', 'Email notification when recovery is detected. Configure a destination and enable it.', false, 'INCIDENT_RECOVERY_DETECTED', 'EMAIL', 'MAJOR', NULL, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000704', 'incident-resolved-email', 'Email notification after an incident is resolved. Configure a destination and enable it.', false, 'INCIDENT_RESOLVED', 'EMAIL', 'MAJOR', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
