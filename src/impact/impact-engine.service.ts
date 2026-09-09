import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CustomerConnectionStatus,
  Incident,
  IncidentCustomer,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import {
  ZASMAOLT_ADAPTER,
  type ExternalCustomer,
  type ZasmaoltAdapter,
} from '../integrations/zasmaolt/zasmaolt.adapter';
import type { ListIncidentCustomersQueryDto } from './dto/list-incident-customers-query.dto';

export interface ImpactSummary {
  incidentId: string;
  totalCustomers: number;
  confirmedAffectedCustomers: number;
  onlineCustomers: number;
  offlineOnus: number;
  onlineOnus: number;
  impactPercentage: number;
}

@Injectable()
export class ImpactEngineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ZASMAOLT_ADAPTER) private readonly zasmaolt: ZasmaoltAdapter,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async refreshIncident(incident: Incident): Promise<ImpactSummary> {
    if (!incident.oltExternalId || !incident.ponIdentifier)
      return this.emptySummary(incident.id);
    const customers = await this.zasmaolt.getCustomersForPon(
      incident.oltExternalId,
      incident.ponIdentifier,
    );
    const now = new Date();
    const previousCustomers = await this.prisma.incidentCustomer.findMany({
      where: { incidentId: incident.id },
    });
    const previousByExternalId = new Map(
      previousCustomers.map((customer) => [
        customer.externalCustomerId,
        customer,
      ]),
    );

    const summary = this.calculateSummary(incident.id, customers);
    await this.prisma.$transaction(async (transaction) => {
      for (const customer of customers) {
        await this.upsertCustomer(
          transaction,
          incident,
          customer,
          previousByExternalId.get(customer.externalCustomerId),
          now,
        );
      }
      await transaction.incident.update({
        where: { id: incident.id },
        data: {
          potentialCustomerCount: summary.totalCustomers,
          affectedCustomerCount: summary.confirmedAffectedCustomers,
          confirmedCustomerCount: summary.confirmedAffectedCustomers,
          onlineCustomerCount: summary.onlineCustomers,
          offlineOnuCount: summary.offlineOnus,
          onlineOnuCount: summary.onlineOnus,
        },
      });
      await transaction.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          eventType: 'IMPACT_RECALCULATED',
          title: 'Customer impact recalculated',
          metadata: JSON.parse(
            JSON.stringify(summary),
          ) as Prisma.InputJsonValue,
          performedBy: 'SYSTEM',
        },
      });
    });
    this.metrics?.recordAffectedCustomers(summary.confirmedAffectedCustomers);
    return summary;
  }

  async refreshByIncidentId(incidentId: string): Promise<ImpactSummary> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident)
      throw new NotFoundException({
        error: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    return this.refreshIncident(incident);
  }

  async listCustomers(
    incidentId: string,
    query: ListIncidentCustomersQueryDto,
  ): Promise<{
    data: IncidentCustomer[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: Prisma.IncidentCustomerWhereInput = {
      incidentId,
      currentStatus: query.status,
      confirmedAffected: query.confirmedAffected,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.incidentCustomer.findMany({
        where,
        orderBy: [{ confirmedAffected: 'desc' }, { customerCode: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.incidentCustomer.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  private async upsertCustomer(
    transaction: Prisma.TransactionClient,
    incident: Incident,
    customer: ExternalCustomer,
    previous: IncidentCustomer | undefined,
    now: Date,
  ): Promise<void> {
    const isOffline = customer.status === CustomerConnectionStatus.OFFLINE;
    const affectedFrom = isOffline
      ? (previous?.affectedFrom ?? incident.detectedAt)
      : previous?.affectedFrom;
    const restoredAt =
      !isOffline && previous?.affectedFrom && !previous.restoredAt
        ? now
        : previous?.restoredAt;
    const impactDurationSeconds =
      restoredAt && affectedFrom
        ? Math.max(
            0,
            Math.floor((restoredAt.getTime() - affectedFrom.getTime()) / 1_000),
          )
        : (previous?.impactDurationSeconds ?? 0);
    const commonData = {
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      onuSerial: customer.onuSerial,
      servicePlan: customer.servicePlan,
      serviceType: customer.serviceType,
      currentStatus: customer.status,
      rxPowerDuring: isOffline ? customer.rxPower : previous?.rxPowerDuring,
      rxPowerAfter: !isOffline ? customer.rxPower : previous?.rxPowerAfter,
      affectedFrom,
      restoredAt,
      impactDurationSeconds,
      confirmedAffected: isOffline,
    };
    await transaction.incidentCustomer.upsert({
      where: {
        incidentId_externalCustomerId: {
          incidentId: incident.id,
          externalCustomerId: customer.externalCustomerId,
        },
      },
      create: {
        incidentId: incident.id,
        externalCustomerId: customer.externalCustomerId,
        initialStatus: CustomerConnectionStatus.UNKNOWN,
        rxPowerBefore: undefined,
        ...commonData,
      },
      update: commonData,
    });
  }

  private calculateSummary(
    incidentId: string,
    customers: ExternalCustomer[],
  ): ImpactSummary {
    const confirmedAffectedCustomers = customers.filter(
      (customer) => customer.status === CustomerConnectionStatus.OFFLINE,
    ).length;
    const onlineCustomers = customers.filter(
      (customer) => customer.status === CustomerConnectionStatus.ONLINE,
    ).length;
    return {
      incidentId,
      totalCustomers: customers.length,
      confirmedAffectedCustomers,
      onlineCustomers,
      offlineOnus: confirmedAffectedCustomers,
      onlineOnus: onlineCustomers,
      impactPercentage:
        customers.length === 0
          ? 0
          : Number(
              ((confirmedAffectedCustomers / customers.length) * 100).toFixed(
                2,
              ),
            ),
    };
  }

  private emptySummary(incidentId: string): ImpactSummary {
    return {
      incidentId,
      totalCustomers: 0,
      confirmedAffectedCustomers: 0,
      onlineCustomers: 0,
      offlineOnus: 0,
      onlineOnus: 0,
      impactPercentage: 0,
    };
  }
}
