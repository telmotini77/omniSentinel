import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  Incident,
  IncidentStatus,
  NotificationEvent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../observability/metrics.service';
import type { ChangeIncidentStatusDto } from './dto/change-incident-status.dto';
import type { IncidentActionDto } from './dto/incident-action.dto';
import type { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { assertIncidentTransition } from './incident-state-machine';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async list(
    query: ListIncidentsQueryDto,
  ): Promise<{ data: Incident[]; total: number; page: number; limit: number }> {
    const where: Prisma.IncidentWhereInput = {
      status: query.status,
      severity: query.severity,
      type: query.type,
      rootCause: query.rootCause,
      oltExternalId: query.oltExternalId,
      ponIdentifier: query.ponIdentifier,
      detectedAt:
        query.startDate || query.endDate
          ? {
              gte: query.startDate ? new Date(query.startDate) : undefined,
              lte: query.endDate ? new Date(query.endDate) : undefined,
            }
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async getById(id: string): Promise<Incident> {
    return this.getIncidentOrThrow(id);
  }

  async timeline(id: string) {
    await this.getIncidentOrThrow(id);
    return this.prisma.incidentTimeline.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async events(id: string) {
    await this.getIncidentOrThrow(id);
    return this.prisma.incidentEvent.findMany({
      where: { incidentId: id },
      include: { alert: true },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async acknowledge(
    id: string,
    action: IncidentActionDto,
    performedBy: string,
  ): Promise<Incident> {
    return this.transition(
      id,
      { status: IncidentStatus.INVESTIGATING, note: action.note },
      performedBy,
      'INCIDENT_ACKNOWLEDGED',
    );
  }

  async resolve(
    id: string,
    action: IncidentActionDto,
    performedBy: string,
  ): Promise<Incident> {
    return this.transition(
      id,
      { status: IncidentStatus.RESOLVED, note: action.note },
      performedBy,
      'INCIDENT_RESOLVED',
    );
  }

  async close(
    id: string,
    action: IncidentActionDto,
    performedBy: string,
  ): Promise<Incident> {
    return this.transition(
      id,
      { status: IncidentStatus.CLOSED, note: action.note },
      performedBy,
      'INCIDENT_CLOSED',
    );
  }

  async transition(
    id: string,
    change: ChangeIncidentStatusDto,
    performedBy: string,
    timelineEventType = 'INCIDENT_STATUS_CHANGED',
  ): Promise<Incident> {
    const updated = await this.prisma.$transaction(async (transaction) => {
      const incident = await transaction.incident.findUnique({ where: { id } });
      if (!incident)
        throw new NotFoundException({
          error: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found',
        });
      assertIncidentTransition(incident.status, change.status);

      const now = new Date();
      const completedStatuses: IncidentStatus[] = [
        IncidentStatus.RESOLVED,
        IncidentStatus.CLOSED,
      ];
      const durationSeconds = completedStatuses.includes(change.status)
        ? Math.max(
            0,
            Math.floor((now.getTime() - incident.startedAt.getTime()) / 1_000),
          )
        : incident.durationSeconds;
      const updated = await transaction.incident.update({
        where: { id },
        data: {
          status: change.status,
          acknowledgedAt:
            change.status === IncidentStatus.INVESTIGATING &&
            !incident.acknowledgedAt
              ? now
              : undefined,
          resolvedAt:
            change.status === IncidentStatus.RESOLVED ? now : undefined,
          closedAt: change.status === IncidentStatus.CLOSED ? now : undefined,
          durationSeconds,
        },
      });
      await transaction.incidentTimeline.create({
        data: {
          incidentId: id,
          eventType: timelineEventType,
          title: `Status changed to ${change.status}`,
          description: change.note,
          metadata: {
            previousStatus: incident.status,
            currentStatus: change.status,
          },
          performedBy,
        },
      });
      return updated;
    });
    if (change.status === IncidentStatus.RESOLVED) {
      await this.notifications.dispatch(
        NotificationEvent.INCIDENT_RESOLVED,
        updated,
      );
      this.metrics?.recordIncidentResolved(updated.severity);
    }
    if (change.status === IncidentStatus.CLOSED) {
      await this.notifications.dispatch(
        NotificationEvent.INCIDENT_CLOSED,
        updated,
      );
    }
    return updated;
  }

  private async getIncidentOrThrow(id: string): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident)
      throw new NotFoundException({
        error: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    return incident;
  }
}
