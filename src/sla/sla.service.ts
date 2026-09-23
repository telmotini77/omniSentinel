import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Incident,
  IncidentCustomer,
  IncidentStatus,
  Prisma,
  SlaRecord,
  SlaScope,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AnalyticsPeriodQueryDto } from '../statistics/dto/analytics-period-query.dto';
import type { CreateSlaSnapshotDto } from './dto/create-sla-snapshot.dto';
import type { ListSlaRecordsQueryDto } from './dto/list-sla-records-query.dto';
import type { DowntimeInterval, SlaCalculation, SlaPeriod } from './sla.types';
import { APPROVED_ALERT_EVENT_TYPES } from '../alerts/constants/network-event-types';

const DEFAULT_PERIOD_DAYS = 30;

@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(query: AnalyticsPeriodQueryDto): Promise<SlaCalculation> {
    const period = this.resolvePeriod(query);
    if (query.customerCode) return this.calculateCustomerSla(query, period);

    const incidents = await this.prisma.incident.findMany({
      where: this.incidentWhere(query, period),
      orderBy: { startedAt: 'asc' },
    });
    return this.buildCalculation(
      this.resolveScope(query),
      period,
      incidents,
      incidents.flatMap((incident) => this.incidentInterval(incident, period)),
    );
  }

  async createSnapshot(dto: CreateSlaSnapshotDto): Promise<SlaRecord> {
    const calculation = await this.calculate(dto);
    return this.prisma.slaRecord.upsert({
      where: {
        scope_scopeKey_periodStart_periodEnd: {
          scope: calculation.scope,
          scopeKey: dto.label?.trim() || calculation.scopeKey,
          periodStart: calculation.periodStart,
          periodEnd: calculation.periodEnd,
        },
      },
      create: {
        scope: calculation.scope,
        scopeKey: dto.label?.trim() || calculation.scopeKey,
        periodStart: calculation.periodStart,
        periodEnd: calculation.periodEnd,
        totalMinutes: calculation.totalMinutes,
        downtimeMinutes: calculation.downtimeMinutes,
        availabilityPercentage: calculation.availabilityPercentage,
        incidentCount: calculation.incidentCount,
        mttrMinutes: calculation.mttrMinutes,
        mtbfMinutes: calculation.mtbfMinutes,
      },
      update: {
        totalMinutes: calculation.totalMinutes,
        downtimeMinutes: calculation.downtimeMinutes,
        availabilityPercentage: calculation.availabilityPercentage,
        incidentCount: calculation.incidentCount,
        mttrMinutes: calculation.mttrMinutes,
        mtbfMinutes: calculation.mtbfMinutes,
        calculatedAt: new Date(),
      },
    });
  }

  async listSnapshots(query: ListSlaRecordsQueryDto): Promise<{
    data: SlaRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: Prisma.SlaRecordWhereInput = {
      scope: query.scope,
      scopeKey: query.scopeKey,
      periodEnd: query.startDate
        ? { gte: new Date(query.startDate) }
        : undefined,
      periodStart: query.endDate ? { lte: new Date(query.endDate) } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.slaRecord.findMany({
        where,
        orderBy: [{ periodEnd: 'desc' }, { calculatedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.slaRecord.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  resolvePeriod(query: AnalyticsPeriodQueryDto): SlaPeriod {
    const now = new Date();
    const requestedEnd = query.endDate ? new Date(query.endDate) : now;
    const end = requestedEnd > now ? now : requestedEnd;
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(end.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1_000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException({
        error: 'INVALID_ANALYTICS_PERIOD',
        message: 'startDate and endDate must be valid ISO dates',
      });
    }
    if (start >= end) {
      throw new BadRequestException({
        error: 'INVALID_ANALYTICS_PERIOD',
        message: 'startDate must be earlier than endDate',
      });
    }
    return { start, end };
  }

  incidentWhere(
    query: AnalyticsPeriodQueryDto,
    period: SlaPeriod,
  ): Prisma.IncidentWhereInput {
    const filters: Prisma.IncidentWhereInput[] = [
      { events: { some: { eventType: { in: APPROVED_ALERT_EVENT_TYPES } } } },
      { detectedAt: { lt: period.end } },
      {
        OR: [
          { resolvedAt: null },
          {
            resolvedAt: {
              gt: period.start,
            },
          },
        ],
      },
    ];
    if (query.status) filters.push({ status: query.status });
    else filters.push({ status: { not: IncidentStatus.FALSE_POSITIVE } });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.type) filters.push({ type: query.type });
    if (query.rootCause) filters.push({ rootCause: query.rootCause });
    if (query.oltExternalId)
      filters.push({ oltExternalId: query.oltExternalId });
    if (query.ponIdentifier)
      filters.push({ ponIdentifier: query.ponIdentifier });
    return { AND: filters };
  }

  private async calculateCustomerSla(
    query: AnalyticsPeriodQueryDto,
    period: SlaPeriod,
  ): Promise<SlaCalculation> {
    const customers = await this.prisma.incidentCustomer.findMany({
      where: {
        customerCode: query.customerCode,
        affectedFrom: { not: null, lt: period.end },
        OR: [{ restoredAt: null }, { restoredAt: { gt: period.start } }],
        incident: this.incidentWhere(query, period),
      },
      include: { incident: true },
      orderBy: { affectedFrom: 'asc' },
    });
    const incidents = Array.from(
      new Map(
        customers.map((customer) => [customer.incidentId, customer.incident]),
      ).values(),
    );
    return this.buildCalculation(
      this.resolveScope(query),
      period,
      incidents,
      customers.flatMap((customer) => this.customerInterval(customer, period)),
    );
  }

  private buildCalculation(
    scope: { scope: SlaScope; scopeKey: string },
    period: SlaPeriod,
    incidents: Incident[],
    intervals: DowntimeInterval[],
  ): SlaCalculation {
    const mergedIntervals = this.mergeIntervals(intervals);
    const totalMinutes =
      (period.end.getTime() - period.start.getTime()) / 60_000;
    const downtimeMinutes = mergedIntervals.reduce(
      (total, interval) =>
        total + (interval.end.getTime() - interval.start.getTime()) / 60_000,
      0,
    );
    const resolved = incidents.filter(
      (incident) =>
        incident.resolvedAt !== null &&
        incident.resolvedAt > period.start &&
        incident.resolvedAt <= period.end,
    );
    const totalRecoveryMinutes = resolved.reduce((total, incident) => {
      const interval = this.incidentInterval(incident, period)[0];
      if (!interval) return total;
      return (
        total + (interval.end.getTime() - interval.start.getTime()) / 60_000
      );
    }, 0);
    const safeDowntime = Math.min(totalMinutes, downtimeMinutes);
    return {
      scope: scope.scope,
      scopeKey: scope.scopeKey,
      periodStart: period.start,
      periodEnd: period.end,
      totalMinutes: this.round(totalMinutes),
      downtimeMinutes: this.round(safeDowntime),
      availabilityPercentage: this.round(
        ((totalMinutes - safeDowntime) / totalMinutes) * 100,
      ),
      incidentCount: incidents.length,
      mttrMinutes:
        resolved.length === 0
          ? null
          : this.round(totalRecoveryMinutes / resolved.length),
      mtbfMinutes:
        incidents.length === 0
          ? null
          : this.round((totalMinutes - safeDowntime) / incidents.length),
    };
  }

  private resolveScope(query: AnalyticsPeriodQueryDto): {
    scope: SlaScope;
    scopeKey: string;
  } {
    if (query.customerCode)
      return { scope: SlaScope.CUSTOMER, scopeKey: query.customerCode };
    if (query.ponIdentifier) {
      return {
        scope: SlaScope.PON,
        scopeKey: `${query.oltExternalId ?? 'UNSPECIFIED'}:${query.ponIdentifier}`,
      };
    }
    if (query.oltExternalId)
      return { scope: SlaScope.OLT, scopeKey: query.oltExternalId };
    return { scope: SlaScope.GLOBAL, scopeKey: 'GLOBAL' };
  }

  private incidentInterval(
    incident: Incident,
    period: SlaPeriod,
  ): DowntimeInterval[] {
    const start = new Date(
      Math.max(incident.startedAt.getTime(), period.start.getTime()),
    );
    const end = new Date(
      Math.min(
        (incident.resolvedAt ?? period.end).getTime(),
        period.end.getTime(),
      ),
    );
    return end > start ? [{ start, end }] : [];
  }

  private customerInterval(
    customer: IncidentCustomer,
    period: SlaPeriod,
  ): DowntimeInterval[] {
    if (!customer.affectedFrom) return [];
    const recoveredAt = customer.restoredAt ?? period.end;
    const start = new Date(
      Math.max(customer.affectedFrom.getTime(), period.start.getTime()),
    );
    const end = new Date(Math.min(recoveredAt.getTime(), period.end.getTime()));
    return end > start ? [{ start, end }] : [];
  }

  private mergeIntervals(intervals: DowntimeInterval[]): DowntimeInterval[] {
    const ordered = [...intervals].sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    );
    const merged: DowntimeInterval[] = [];
    for (const interval of ordered) {
      const previous = merged.at(-1);
      if (!previous || interval.start > previous.end) {
        merged.push({ ...interval });
        continue;
      }
      if (interval.end > previous.end) previous.end = interval.end;
    }
    return merged;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
