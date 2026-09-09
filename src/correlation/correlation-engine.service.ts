import { Injectable } from '@nestjs/common';
import {
  Alert,
  AlertSeverity,
  CorrelationRule,
  Incident,
  IncidentType,
  Prisma,
  RootCause,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';

export interface CorrelationDecision {
  correlationKey: string;
  eventCount: number;
  distinctOnuCount: number;
  affectedCustomerCount: number;
  incidentType: IncidentType;
  rootCause: RootCause;
  rootCauseConfidence: number;
  severity: AlertSeverity;
  matchedRule: CorrelationRule | undefined;
}

const RECOVERY_EVENTS = new Set([
  'onu.online',
  'pon.up',
  'olt.up',
  'uplink.up',
  'zabbix.problem.resolved',
]);

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  [AlertSeverity.INFO]: 0,
  [AlertSeverity.WARNING]: 1,
  [AlertSeverity.MINOR]: 2,
  [AlertSeverity.MAJOR]: 3,
  [AlertSeverity.CRITICAL]: 4,
  [AlertSeverity.DISASTER]: 5,
};

export function isMoreSevere(
  candidate: AlertSeverity,
  current: AlertSeverity,
): boolean {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current];
}

@Injectable()
export class CorrelationEngineService {
  constructor(private readonly configService: ConfigService) {}

  async analyze(
    transaction: Prisma.TransactionClient,
    alert: Alert,
  ): Promise<CorrelationDecision> {
    const correlationKey = this.buildCorrelationKey(alert);
    const windowStart = new Date(
      alert.detectedAt.getTime() -
        this.configService.getOrThrow<number>(
          'INCIDENT_CORRELATION_WINDOW_SECONDS',
        ) *
          1_000,
    );
    const alerts = await transaction.alert.findMany({
      where: {
        ...this.scopeForCorrelationKey(alert, correlationKey),
        detectedAt: { gte: windowStart },
        eventType: { notIn: [...RECOVERY_EVENTS] },
      },
      select: { eventType: true, onuSerial: true, payload: true },
    });
    const eventCount = alerts.length || 1;
    const distinctOnuCount = new Set(
      alerts
        .filter((candidate) => candidate.eventType === 'onu.offline')
        .map((candidate) => candidate.onuSerial)
        .filter((onuSerial): onuSerial is string => Boolean(onuSerial)),
    ).size;
    const affectedCustomerCount = Math.max(
      0,
      ...alerts.map((candidate) =>
        this.readOfflineCustomerCount(candidate.payload),
      ),
    );
    const rules = await transaction.correlationRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    const matchingRules = rules.filter((rule) =>
      this.matches(rule, alert, {
        eventCount,
        distinctOnuCount,
        affectedCustomerCount,
      }),
    );
    const matchedRule = matchingRules.find(
      (rule) => rule.incidentType !== null || rule.rootCause !== null,
    );
    const severity = matchingRules.reduce(
      (highest, rule) =>
        rule.severity && SEVERITY_RANK[rule.severity] > SEVERITY_RANK[highest]
          ? rule.severity
          : highest,
      alert.severity,
    );

    return {
      correlationKey,
      eventCount,
      distinctOnuCount,
      affectedCustomerCount,
      incidentType: matchedRule?.incidentType ?? IncidentType.UNKNOWN,
      rootCause: matchedRule?.rootCause ?? RootCause.UNKNOWN,
      rootCauseConfidence: matchedRule?.rootCauseConfidence ?? 0,
      severity,
      matchedRule,
    };
  }

  async record(
    transaction: Prisma.TransactionClient,
    alert: Alert,
    incident: Incident | undefined,
    decision: CorrelationDecision,
  ): Promise<void> {
    await transaction.correlationResult.create({
      data: {
        alertId: alert.id,
        incidentId: incident?.id,
        correlationRuleId: decision.matchedRule?.id,
        correlationKey: decision.correlationKey,
        eventCount: decision.eventCount,
        distinctOnuCount: decision.distinctOnuCount,
        affectedCustomerCount: decision.affectedCustomerCount,
        rootCause: decision.rootCause,
        rootCauseConfidence: decision.rootCauseConfidence,
        severity: decision.severity,
      },
    });
    if (!incident) return;
    await transaction.incidentTimeline.create({
      data: {
        incidentId: incident.id,
        eventType: 'CORRELATION_ANALYZED',
        title: decision.matchedRule
          ? `Correlation rule applied: ${decision.matchedRule.name}`
          : 'No correlation rule matched',
        metadata: {
          correlationKey: decision.correlationKey,
          eventCount: decision.eventCount,
          distinctOnuCount: decision.distinctOnuCount,
          affectedCustomerCount: decision.affectedCustomerCount,
          rootCause: decision.rootCause,
          rootCauseConfidence: decision.rootCauseConfidence,
          severity: decision.severity,
        },
        performedBy: 'SYSTEM',
      },
    });
  }

  private buildCorrelationKey(alert: Alert): string {
    const olt = alert.oltExternalId ?? 'unknown-olt';
    if (alert.eventType.startsWith('olt.')) return `olt:${olt}`;
    if (alert.eventType.startsWith('uplink.')) return `uplink:${olt}`;
    if (alert.ponIdentifier) return `pon:${olt}:${alert.ponIdentifier}`;
    if (alert.onuSerial) return `onu:${olt}:${alert.onuSerial}`;
    return `alert:${alert.id}`;
  }

  private scopeForCorrelationKey(
    alert: Alert,
    correlationKey: string,
  ): Prisma.AlertWhereInput {
    if (correlationKey.startsWith('pon:')) {
      return {
        oltExternalId: alert.oltExternalId,
        ponIdentifier: alert.ponIdentifier,
      };
    }
    if (
      correlationKey.startsWith('olt:') ||
      correlationKey.startsWith('uplink:')
    )
      return { oltExternalId: alert.oltExternalId };
    if (correlationKey.startsWith('onu:'))
      return {
        oltExternalId: alert.oltExternalId,
        onuSerial: alert.onuSerial,
      };
    return { id: alert.id };
  }

  private matches(
    rule: CorrelationRule,
    alert: Alert,
    counts: {
      eventCount: number;
      distinctOnuCount: number;
      affectedCustomerCount: number;
    },
  ): boolean {
    return (
      this.matchesEventPattern(rule.eventPattern, alert.eventType) &&
      (rule.minimumEventCount === null ||
        counts.eventCount >= rule.minimumEventCount) &&
      (rule.minimumDistinctOnus === null ||
        counts.distinctOnuCount >= rule.minimumDistinctOnus) &&
      (rule.minimumAffectedCustomers === null ||
        counts.affectedCustomerCount >= rule.minimumAffectedCustomers)
    );
  }

  private matchesEventPattern(pattern: string, eventType: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*'))
      return eventType.startsWith(pattern.slice(0, -1));
    return pattern === eventType;
  }

  private readOfflineCustomerCount(payload: Prisma.JsonValue): number {
    if (!this.isRecord(payload) || !this.isRecord(payload.metrics)) return 0;
    const offline = payload.metrics.onuOffline;
    return typeof offline === 'number' && Number.isFinite(offline)
      ? Math.max(0, offline)
      : 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
