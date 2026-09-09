import { Injectable } from '@nestjs/common';
import {
  AlertSeverity,
  CustomerConnectionStatus,
  Incident,
  IncidentCustomer,
  IncidentStatus,
  Prisma,
  RootCause,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SlaService } from '../sla/sla.service';
import type { SlaCalculation, SlaPeriod } from '../sla/sla.types';
import type { AnalyticsPeriodQueryDto } from './dto/analytics-period-query.dto';

export interface CountByValue<T extends string> {
  value: T;
  count: number;
}

interface CustomerAggregate {
  customerCode: string;
  customerName: string | null;
  incidentIds: Set<string>;
  intervals: Array<{ start: Date; end: Date }>;
  currentlyOffline: boolean;
}

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slaService: SlaService,
  ) {}

  async overview(query: AnalyticsPeriodQueryDto) {
    const [incidents, customers, availability] = await Promise.all([
      this.incidents(query),
      this.customers(query),
      this.slaService.calculate(query),
    ]);
    return { incidents, customers, availability };
  }

  async incidents(query: AnalyticsPeriodQueryDto) {
    const period = this.slaService.resolvePeriod(query);
    const incidents = await this.prisma.incident.findMany({
      where: this.detectedIncidentWhere(query, period),
      orderBy: { detectedAt: 'asc' },
    });
    const activeStatuses = new Set<IncidentStatus>([
      IncidentStatus.DETECTED,
      IncidentStatus.INVESTIGATING,
      IncidentStatus.CONFIRMED,
      IncidentStatus.IN_PROGRESS,
      IncidentStatus.MONITORING,
    ]);
    const resolved = incidents.filter(
      (incident) => incident.resolvedAt !== null,
    );
    return {
      periodStart: period.start,
      periodEnd: period.end,
      totals: {
        incidents: incidents.length,
        active: incidents.filter((incident) =>
          activeStatuses.has(incident.status),
        ).length,
        resolved: resolved.length,
        affectedCustomers: incidents.reduce(
          (total, incident) => total + incident.affectedCustomerCount,
          0,
        ),
        offlineOnus: incidents.reduce(
          (total, incident) => total + incident.offlineOnuCount,
          0,
        ),
        averageRecoveryMinutes: this.averageRecoveryMinutes(resolved, period),
      },
      bySeverity: this.countEnum(
        AlertSeverity,
        incidents.map((item) => item.severity),
      ),
      byStatus: this.countEnum(
        IncidentStatus,
        incidents.map((item) => item.status),
      ),
      byRootCause: this.countEnum(
        RootCause,
        incidents.map((item) => item.rootCause),
      ),
      byDay: this.byDay(incidents),
      byOlt: this.byLocation(
        incidents,
        (incident) => incident.oltExternalId ?? 'UNASSIGNED',
      ),
      byPon: this.byLocation(incidents, (incident) =>
        incident.ponIdentifier
          ? `${incident.oltExternalId ?? 'UNASSIGNED'}:${incident.ponIdentifier}`
          : 'UNASSIGNED',
      ),
    };
  }

  async customers(query: AnalyticsPeriodQueryDto) {
    const period = this.slaService.resolvePeriod(query);
    const affectedCustomers = await this.prisma.incidentCustomer.findMany({
      where: {
        customerCode: query.customerCode,
        affectedFrom: { not: null, lt: period.end },
        OR: [{ restoredAt: null }, { restoredAt: { gt: period.start } }],
        incident: this.slaService.incidentWhere(query, period),
      },
      orderBy: { affectedFrom: 'asc' },
    });
    const grouped = this.groupCustomers(affectedCustomers, period);
    const mostAffected = [...grouped.values()]
      .map((customer) => ({
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        incidentCount: customer.incidentIds.size,
        accumulatedDowntimeMinutes: this.round(
          this.totalMinutes(this.mergeIntervals(customer.intervals)),
        ),
        currentlyOffline: customer.currentlyOffline,
      }))
      .sort(
        (left, right) =>
          right.accumulatedDowntimeMinutes - left.accumulatedDowntimeMinutes ||
          right.incidentCount - left.incidentCount ||
          left.customerCode.localeCompare(right.customerCode),
      )
      .slice(0, 20);
    return {
      periodStart: period.start,
      periodEnd: period.end,
      totals: {
        uniqueAffectedCustomers: grouped.size,
        currentlyOfflineCustomers: [...grouped.values()].filter(
          (customer) => customer.currentlyOffline,
        ).length,
        accumulatedDowntimeMinutes: this.round(
          [...grouped.values()].reduce(
            (total, customer) =>
              total +
              this.totalMinutes(this.mergeIntervals(customer.intervals)),
            0,
          ),
        ),
      },
      mostAffected,
    };
  }

  availability(query: AnalyticsPeriodQueryDto): Promise<SlaCalculation> {
    return this.slaService.calculate(query);
  }

  private detectedIncidentWhere(
    query: AnalyticsPeriodQueryDto,
    period: SlaPeriod,
  ): Prisma.IncidentWhereInput {
    const filters: Prisma.IncidentWhereInput[] = [
      {
        detectedAt: {
          gte: period.start,
          lte: period.end,
        },
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
    if (query.customerCode)
      filters.push({
        customers: { some: { customerCode: query.customerCode } },
      });
    return { AND: filters };
  }

  private countEnum<T extends string>(
    enumObject: Record<string, T>,
    values: T[],
  ): CountByValue<T>[] {
    return Object.values(enumObject).map((value) => ({
      value,
      count: values.filter((selected) => selected === value).length,
    }));
  }

  private byDay(incidents: Incident[]) {
    const byDay = new Map<
      string,
      { incidents: number; resolved: number; affectedCustomers: number }
    >();
    for (const incident of incidents) {
      const date = incident.detectedAt.toISOString().slice(0, 10);
      const summary = byDay.get(date) ?? {
        incidents: 0,
        resolved: 0,
        affectedCustomers: 0,
      };
      summary.incidents += 1;
      summary.affectedCustomers += incident.affectedCustomerCount;
      if (incident.resolvedAt) summary.resolved += 1;
      byDay.set(date, summary);
    }
    return [...byDay.entries()].map(([date, values]) => ({ date, ...values }));
  }

  private byLocation(
    incidents: Incident[],
    location: (incident: Incident) => string,
  ) {
    const groups = new Map<
      string,
      { incidents: number; affectedCustomers: number; downtimeMinutes: number }
    >();
    for (const incident of incidents) {
      const key = location(incident);
      const group = groups.get(key) ?? {
        incidents: 0,
        affectedCustomers: 0,
        downtimeMinutes: 0,
      };
      group.incidents += 1;
      group.affectedCustomers += incident.affectedCustomerCount;
      group.downtimeMinutes += incident.durationSeconds / 60;
      groups.set(key, group);
    }
    return [...groups.entries()]
      .map(([key, values]) => ({
        key,
        ...values,
        downtimeMinutes: this.round(values.downtimeMinutes),
      }))
      .sort(
        (left, right) =>
          right.incidents - left.incidents || left.key.localeCompare(right.key),
      );
  }

  private groupCustomers(
    customers: IncidentCustomer[],
    period: SlaPeriod,
  ): Map<string, CustomerAggregate> {
    const grouped = new Map<string, CustomerAggregate>();
    for (const customer of customers) {
      const key = customer.customerCode ?? customer.externalCustomerId;
      const aggregate = grouped.get(key) ?? {
        customerCode: key,
        customerName: customer.customerName,
        incidentIds: new Set<string>(),
        intervals: [],
        currentlyOffline: false,
      };
      aggregate.incidentIds.add(customer.incidentId);
      aggregate.currentlyOffline ||=
        customer.currentStatus === CustomerConnectionStatus.OFFLINE;
      if (customer.affectedFrom) {
        const start = new Date(
          Math.max(customer.affectedFrom.getTime(), period.start.getTime()),
        );
        const end = new Date(
          Math.min(
            (customer.restoredAt ?? period.end).getTime(),
            period.end.getTime(),
          ),
        );
        if (end > start) aggregate.intervals.push({ start, end });
      }
      grouped.set(key, aggregate);
    }
    return grouped;
  }

  private averageRecoveryMinutes(
    incidents: Incident[],
    period: SlaPeriod,
  ): number | null {
    const resolved = incidents.filter(
      (incident) => incident.resolvedAt !== null,
    );
    if (resolved.length === 0) return null;
    return this.round(
      resolved.reduce((total, incident) => {
        const start = Math.max(
          incident.startedAt.getTime(),
          period.start.getTime(),
        );
        const end = Math.min(
          incident.resolvedAt?.getTime() ?? period.end.getTime(),
          period.end.getTime(),
        );
        return total + Math.max(0, end - start) / 60_000;
      }, 0) / resolved.length,
    );
  }

  private mergeIntervals(
    intervals: Array<{ start: Date; end: Date }>,
  ): Array<{ start: Date; end: Date }> {
    const ordered = [...intervals].sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    );
    const merged: Array<{ start: Date; end: Date }> = [];
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

  private totalMinutes(intervals: Array<{ start: Date; end: Date }>): number {
    return intervals.reduce(
      (total, interval) =>
        total + (interval.end.getTime() - interval.start.getTime()) / 60_000,
      0,
    );
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
