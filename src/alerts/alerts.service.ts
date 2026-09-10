import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Alert, AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import type { ListAlertsQueryDto } from './dto/list-alerts-query.dto';
import type { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';

export interface AlertIngestResult {
  result: 'created' | 'duplicate';
  alert: Alert;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async ingest(event: NormalizedNetworkEventDto): Promise<AlertIngestResult> {
    try {
      const alert = await this.prisma.alert.create({
        data: {
          externalEventId: event.eventId,
          eventType: event.eventType,
          severity: event.severity,
          source: event.source,
          status: this.isRecoveryEvent(event.eventType)
            ? AlertStatus.RESOLVED
            : AlertStatus.NEW,
          message: event.message,
          oltExternalId: event.device.oltId,
          ponIdentifier: `${event.device.board}/${event.device.pon}`,
          onuSerial: event.onuSerial,
          customerCode: event.customerCode,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
          detectedAt: new Date(event.timestamp),
          resolvedAt: this.isRecoveryEvent(event.eventType)
            ? new Date(event.timestamp)
            : undefined,
        },
      });
      this.metrics?.recordAlert(event.source, event.eventType, 'created');
      return { result: 'created', alert };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.alert.findUniqueOrThrow({
          where: { externalEventId: event.eventId },
        });
        this.metrics?.recordAlert(event.source, event.eventType, 'duplicate');
        return { result: 'duplicate', alert: duplicate };
      }
      this.metrics?.recordFailedEvent('alert_ingest');
      throw error;
    }
  }

  async findById(id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert)
      throw new NotFoundException({
        error: 'ALERT_NOT_FOUND',
        message: 'Alert not found',
      });
    return alert;
  }

  async list(
    query: ListAlertsQueryDto,
  ): Promise<{ data: Alert[]; total: number; page: number; limit: number }> {
    const where: Prisma.AlertWhereInput = {
      severity: query.severity,
      status: query.status,
      source: query.source,
      eventType: query.eventType,
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
      this.prisma.alert.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  private isRecoveryEvent(eventType: string): boolean {
    return [
      'onu.online',
      'pon.up',
      'olt.up',
      'uplink.up',
      'zabbix.problem.resolved',
    ].includes(eventType);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
