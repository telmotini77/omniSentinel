import { Injectable } from '@nestjs/common';
import { AlertSeverity, IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SlaService } from '../sla/sla.service';
import type { AnalyticsPeriodQueryDto } from '../statistics/dto/analytics-period-query.dto';
import { APPROVED_ALERT_EVENT_TYPES } from '../alerts/constants/network-event-types';

const OPEN_INCIDENT_STATUSES: IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.INVESTIGATING,
  IncidentStatus.CONFIRMED,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.MONITORING,
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slaService: SlaService,
  ) {}

  async summary(query: AnalyticsPeriodQueryDto) {
    const activeWhere = this.activeWhere(query);
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const resolvedTodayWhere: Prisma.IncidentWhereInput = {
      AND: [
        this.locationWhere(query),
        {
          resolvedAt: {
            gte: todayStart,
            lte: now,
          },
        },
      ],
    };
    const [
      activeIncidents,
      criticalIncidents,
      activeImpact,
      resolvedToday,
      sla,
    ] = await Promise.all([
      this.prisma.incident.count({ where: activeWhere }),
      this.prisma.incident.count({
        where: {
          AND: [
            activeWhere,
            {
              severity: {
                in: [AlertSeverity.CRITICAL, AlertSeverity.DISASTER],
              },
            },
          ],
        },
      }),
      this.prisma.incident.aggregate({
        where: activeWhere,
        _sum: {
          affectedCustomerCount: true,
          offlineOnuCount: true,
        },
      }),
      this.prisma.incident.count({ where: resolvedTodayWhere }),
      this.slaService.calculate(query),
    ]);
    return {
      activeIncidents,
      criticalIncidents,
      affectedCustomers: activeImpact._sum.affectedCustomerCount ?? 0,
      offlineOnus: activeImpact._sum.offlineOnuCount ?? 0,
      resolvedToday,
      averageMttr: sla.mttrMinutes,
      availability: sla.availabilityPercentage,
    };
  }

  private activeWhere(
    query: AnalyticsPeriodQueryDto,
  ): Prisma.IncidentWhereInput {
    return {
      AND: [
        this.locationWhere(query),
        { status: { in: OPEN_INCIDENT_STATUSES } },
        ...(query.severity ? [{ severity: query.severity }] : []),
        ...(query.type ? [{ type: query.type }] : []),
        ...(query.rootCause ? [{ rootCause: query.rootCause }] : []),
      ],
    };
  }

  private locationWhere(
    query: AnalyticsPeriodQueryDto,
  ): Prisma.IncidentWhereInput {
    return {
      events: { some: { eventType: { in: APPROVED_ALERT_EVENT_TYPES } } },
      oltExternalId: query.oltExternalId,
      ponIdentifier: query.ponIdentifier,
      customers: query.customerCode
        ? { some: { customerCode: query.customerCode } }
        : undefined,
    };
  }
}
