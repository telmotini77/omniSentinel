import { Injectable, Optional } from '@nestjs/common';
import {
  Alert,
  AlertStatus,
  Incident,
  IncidentStatus,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  CorrelationDecision,
  CorrelationEngineService,
  isMoreSevere,
} from '../correlation/correlation-engine.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { isOpenIncidentStatus } from './incident-state-machine';

export type IncidentProcessingOutcome =
  | 'CREATED'
  | 'CORRELATED'
  | 'RECOVERY_DETECTED'
  | 'ALREADY_PROCESSED'
  | 'IGNORED';

export interface IncidentProcessingResult {
  incident?: Incident;
  outcome: IncidentProcessingOutcome;
}

@Injectable()
export class IncidentEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly correlationEngine: CorrelationEngineService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async processAlert(alert: Alert): Promise<Incident | undefined> {
    const result = await this.processAlertWithOutcome(alert);
    return result.incident;
  }

  async processAlertWithOutcome(
    alert: Alert,
  ): Promise<IncidentProcessingResult> {
    const result = await this.prisma.$transaction((transaction) =>
      this.processInTransaction(transaction, alert),
    );
    if (result.outcome === 'CREATED' && result.incident) {
      this.metrics?.recordIncidentCreated(
        result.incident.type,
        result.incident.severity,
      );
    }
    return result;
  }

  private async processInTransaction(
    transaction: Prisma.TransactionClient,
    alert: Alert,
  ): Promise<IncidentProcessingResult> {
    const alreadyLinked = await transaction.incidentEvent.findUnique({
      where: { alertId: alert.id },
      include: { incident: true },
    });
    if (alreadyLinked)
      return {
        incident: alreadyLinked.incident,
        outcome: 'ALREADY_PROCESSED',
      };

    const decision = await this.correlationEngine.analyze(transaction, alert);
    if (this.isRecoveryAlert(alert.eventType)) {
      const incident = await this.handleRecoveryAlert(
        transaction,
        alert,
        decision,
      );
      await this.correlationEngine.record(
        transaction,
        alert,
        incident,
        decision,
      );
      return {
        incident,
        outcome: incident ? 'RECOVERY_DETECTED' : 'IGNORED',
      };
    }

    const correlationWindow = this.configService.getOrThrow<number>(
      'INCIDENT_CORRELATION_WINDOW_SECONDS',
    );
    const windowStart = new Date(
      alert.detectedAt.getTime() - correlationWindow * 1_000,
    );
    const existingIncident = await transaction.incident.findFirst({
      where: {
        status: {
          in: [
            IncidentStatus.DETECTED,
            IncidentStatus.INVESTIGATING,
            IncidentStatus.CONFIRMED,
            IncidentStatus.IN_PROGRESS,
            IncidentStatus.MONITORING,
          ],
        },
        detectedAt: { gte: windowStart },
        OR: [
          { correlationKey: decision.correlationKey },
          {
            correlationKey: null,
            oltExternalId: alert.oltExternalId,
            ponIdentifier: alert.ponIdentifier,
          },
        ],
      },
      orderBy: { detectedAt: 'asc' },
    });

    if (existingIncident) {
      const incident = await this.applyDecision(
        transaction,
        existingIncident,
        decision,
      );
      await this.attachAlert(
        transaction,
        incident,
        alert,
        'ALERT_CORRELATED',
        'Alert correlated',
      );
      await this.correlationEngine.record(
        transaction,
        alert,
        incident,
        decision,
      );
      return { incident, outcome: 'CORRELATED' };
    }

    const sequence = await transaction.incidentSequence.upsert({
      where: { year: alert.detectedAt.getUTCFullYear() },
      update: { nextNumber: { increment: 1 } },
      create: { year: alert.detectedAt.getUTCFullYear(), nextNumber: 1 },
    });
    const incident = await transaction.incident.create({
      data: {
        code: `INC-${alert.detectedAt.getUTCFullYear()}-${sequence.nextNumber.toString().padStart(6, '0')}`,
        title: this.buildTitle(alert, decision),
        description: alert.message,
        type: decision.incidentType,
        severity: decision.severity,
        source: alert.source,
        rootCause: decision.rootCause,
        rootCauseConfidence: decision.rootCauseConfidence,
        oltExternalId: alert.oltExternalId,
        ponIdentifier: alert.ponIdentifier,
        onuSerial: alert.onuSerial,
        correlationKey: decision.correlationKey,
        detectedAt: alert.detectedAt,
        startedAt: alert.detectedAt,
        ...this.metricCounters(alert),
      },
    });
    await this.attachAlert(
      transaction,
      incident,
      alert,
      'INCIDENT_CREATED',
      'Incident created from alert',
    );
    await this.correlationEngine.record(transaction, alert, incident, decision);
    return { incident, outcome: 'CREATED' };
  }

  private async handleRecoveryAlert(
    transaction: Prisma.TransactionClient,
    alert: Alert,
    decision: CorrelationDecision,
  ): Promise<Incident | undefined> {
    const incident = await transaction.incident.findFirst({
      where: {
        correlationKey: decision.correlationKey,
        status: {
          in: [
            IncidentStatus.DETECTED,
            IncidentStatus.INVESTIGATING,
            IncidentStatus.CONFIRMED,
            IncidentStatus.IN_PROGRESS,
            IncidentStatus.MONITORING,
          ],
        },
      },
      orderBy: { detectedAt: 'desc' },
    });
    if (!incident) return undefined;

    const updated = isOpenIncidentStatus(incident.status)
      ? await transaction.incident.update({
          where: { id: incident.id },
          data: { status: IncidentStatus.MONITORING },
        })
      : incident;
    await this.attachAlert(
      transaction,
      updated,
      alert,
      'RECOVERY_DETECTED',
      'Recovery alert received; incident moved to monitoring',
    );
    return updated;
  }

  private async applyDecision(
    transaction: Prisma.TransactionClient,
    incident: Incident,
    decision: CorrelationDecision,
  ): Promise<Incident> {
    const shouldUpgradeRootCause =
      decision.rootCauseConfidence > incident.rootCauseConfidence;
    const severity = isMoreSevere(decision.severity, incident.severity)
      ? decision.severity
      : incident.severity;
    const type = shouldUpgradeRootCause ? decision.incidentType : incident.type;
    const title = shouldUpgradeRootCause
      ? this.buildTitleFromLocation(
          incident.oltExternalId,
          incident.ponIdentifier,
          decision,
        )
      : incident.title;
    if (
      severity === incident.severity &&
      type === incident.type &&
      title === incident.title &&
      !shouldUpgradeRootCause &&
      incident.correlationKey === decision.correlationKey
    ) {
      return incident;
    }
    return transaction.incident.update({
      where: { id: incident.id },
      data: {
        correlationKey: decision.correlationKey,
        title,
        type,
        severity,
        rootCause: shouldUpgradeRootCause
          ? decision.rootCause
          : incident.rootCause,
        rootCauseConfidence: shouldUpgradeRootCause
          ? decision.rootCauseConfidence
          : incident.rootCauseConfidence,
      },
    });
  }

  private async attachAlert(
    transaction: Prisma.TransactionClient,
    incident: Incident,
    alert: Alert,
    timelineEventType: string,
    timelineTitle: string,
  ): Promise<void> {
    await transaction.incidentEvent.create({
      data: {
        incidentId: incident.id,
        alertId: alert.id,
        eventType: alert.eventType,
        payload:
          alert.payload === null
            ? Prisma.JsonNull
            : (alert.payload as Prisma.InputJsonValue),
        occurredAt: alert.detectedAt,
      },
    });
    if (alert.status !== AlertStatus.RESOLVED) {
      await transaction.alert.update({
        where: { id: alert.id },
        data: { status: AlertStatus.CORRELATED },
      });
    }
    await transaction.incidentTimeline.create({
      data: {
        incidentId: incident.id,
        eventType: timelineEventType,
        title: timelineTitle,
        description: alert.message,
        metadata: {
          alertId: alert.id,
          externalEventId: alert.externalEventId,
          eventType: alert.eventType,
        },
        performedBy: 'SYSTEM',
      },
    });
  }

  private buildTitle(alert: Alert, decision: CorrelationDecision): string {
    return this.buildTitleFromLocation(
      alert.oltExternalId,
      alert.ponIdentifier,
      decision,
    );
  }

  private buildTitleFromLocation(
    oltExternalId: string | null,
    ponIdentifier: string | null,
    decision: CorrelationDecision,
  ): string {
    const location = `${oltExternalId ?? 'Unknown OLT'}${ponIdentifier ? ` PON ${ponIdentifier}` : ''}`;
    return `${decision.incidentType} incident: ${location}`;
  }

  private isRecoveryAlert(eventType: string): boolean {
    return [
      'onu.online',
      'pon.up',
      'olt.up',
      'uplink.up',
      'zabbix.problem.resolved',
    ].includes(eventType);
  }

  private metricCounters(
    alert: Alert,
  ): Pick<
    Incident,
    | 'potentialCustomerCount'
    | 'confirmedCustomerCount'
    | 'onlineCustomerCount'
    | 'affectedCustomerCount'
    | 'offlineOnuCount'
    | 'onlineOnuCount'
  > {
    const payload = alert.payload as {
      metrics?: { onuTotal?: number; onuOnline?: number; onuOffline?: number };
    };
    const metrics = payload.metrics;
    return {
      potentialCustomerCount: metrics?.onuTotal ?? 0,
      confirmedCustomerCount: metrics?.onuOffline ?? 0,
      onlineCustomerCount: metrics?.onuOnline ?? 0,
      affectedCustomerCount: metrics?.onuOffline ?? 0,
      offlineOnuCount: metrics?.onuOffline ?? 0,
      onlineOnuCount: metrics?.onuOnline ?? 0,
    };
  }
}
