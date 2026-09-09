import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Alert,
  AlertSeverity,
  Incident,
  Notification,
  NotificationChannel,
  NotificationEvent,
  NotificationRule,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NOTIFICATION_DELIVERY_STRATEGIES,
  type NotificationDeliveryStrategy,
} from './notification-message';

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  [AlertSeverity.INFO]: 0,
  [AlertSeverity.WARNING]: 1,
  [AlertSeverity.MINOR]: 2,
  [AlertSeverity.MAJOR]: 3,
  [AlertSeverity.CRITICAL]: 4,
  [AlertSeverity.DISASTER]: 5,
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_DELIVERY_STRATEGIES)
    private readonly strategies: NotificationDeliveryStrategy[],
  ) {}

  async dispatch(
    event: NotificationEvent,
    incident: Incident,
    alert?: Alert,
  ): Promise<void> {
    const rules = await this.prisma.notificationRule.findMany({
      where: { enabled: true, event },
    });
    for (const rule of rules) {
      if (!this.meetsSeverity(incident.severity, rule.minimumSeverity))
        continue;
      const destinations = this.destinationsFor(rule);
      if (!destinations.length) {
        await this.createSkippedNotification(rule, event, incident, alert);
        continue;
      }
      for (const destination of destinations) {
        await this.deliver(rule, destination, event, incident, alert);
      }
    }
  }

  async list(query: ListNotificationsQueryDto): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: Prisma.NotificationWhereInput = {
      status: query.status,
      channel: query.channel,
      event: query.event,
      incidentId: query.incidentId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async listForIncident(incidentId: string): Promise<Notification[]> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });
    if (!incident) {
      throw new NotFoundException({
        error: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }
    return this.prisma.notification.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException({
        error: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found',
      });
    }
    return notification;
  }

  private async deliver(
    rule: NotificationRule,
    destination: string,
    event: NotificationEvent,
    incident: Incident,
    alert: Alert | undefined,
  ): Promise<void> {
    const payload = this.payloadFor(event, incident, alert);
    const notification = await this.prisma.notification.create({
      data: {
        ruleId: rule.id,
        incidentId: incident.id,
        channel: rule.channel,
        event,
        destination,
        status: NotificationStatus.PENDING,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: NotificationStatus.SENDING, attempts: { increment: 1 } },
    });
    try {
      const strategy = this.strategyFor(rule.channel);
      const result = await strategy.deliver({
        event,
        incident,
        alert,
        destination,
        payload,
      });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          deliveryMetadata: result.metadata
            ? (JSON.parse(
                JSON.stringify(result.metadata),
              ) as Prisma.InputJsonValue)
            : undefined,
          errorMessage: null,
        },
      });
    } catch (error: unknown) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private async createSkippedNotification(
    rule: NotificationRule,
    event: NotificationEvent,
    incident: Incident,
    alert: Alert | undefined,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        ruleId: rule.id,
        incidentId: incident.id,
        channel: rule.channel,
        event,
        destination: 'UNCONFIGURED',
        status: NotificationStatus.SKIPPED,
        payload: this.payloadFor(
          event,
          incident,
          alert,
        ) as Prisma.InputJsonValue,
        errorMessage: 'No destination is configured for this notification rule',
      },
    });
  }

  private destinationsFor(rule: NotificationRule): string[] {
    const configured = rule.destination?.trim();
    const fallback =
      rule.channel === NotificationChannel.EMAIL
        ? this.configService
            .getOrThrow<string>('NOTIFICATION_EMAIL_RECIPIENTS')
            .trim()
        : '';
    return (configured || fallback)
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private strategyFor(
    channel: NotificationChannel,
  ): NotificationDeliveryStrategy {
    const strategy = this.strategies.find((item) => item.channel === channel);
    if (!strategy) throw new Error(`No notification strategy for ${channel}`);
    return strategy;
  }

  private meetsSeverity(
    severity: AlertSeverity,
    minimumSeverity: AlertSeverity,
  ): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimumSeverity];
  }

  private payloadFor(
    event: NotificationEvent,
    incident: Incident,
    alert: Alert | undefined,
  ): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify({
        event,
        occurredAt: new Date().toISOString(),
        incident: {
          id: incident.id,
          code: incident.code,
          severity: incident.severity,
          status: incident.status,
          type: incident.type,
          rootCause: incident.rootCause,
          rootCauseConfidence: incident.rootCauseConfidence,
          oltExternalId: incident.oltExternalId,
          ponIdentifier: incident.ponIdentifier,
          affectedCustomerCount: incident.confirmedCustomerCount,
        },
        alert: alert
          ? {
              id: alert.id,
              externalEventId: alert.externalEventId,
              eventType: alert.eventType,
              severity: alert.severity,
            }
          : undefined,
      }),
    ) as Record<string, unknown>;
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Unknown delivery error'
    ).slice(0, 2_000);
  }
}
