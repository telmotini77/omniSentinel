import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentStatus, Prisma, ReportType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { GenerateReportDto } from './dto/generate-report.dto';
import type { ReportDocument } from './report-document';

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  async build(dto: GenerateReportDto): Promise<ReportDocument> {
    const periodStart = dto.startDate ? new Date(dto.startDate) : undefined;
    const periodEnd = dto.endDate ? new Date(dto.endDate) : undefined;
    const foundIncident = dto.incidentId
      ? await this.prisma.incident.findUnique({ where: { id: dto.incidentId } })
      : undefined;
    if (dto.incidentId && !foundIncident) {
      throw new NotFoundException({
        error: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }
    const incident = foundIncident ?? undefined;

    const incidentWhere = this.incidentWhere(dto, periodStart, periodEnd);
    const incidents = incident
      ? [incident]
      : await this.prisma.incident.findMany({
          where: incidentWhere,
          orderBy: { detectedAt: 'desc' },
          take: 5_000,
        });
    const incidentIds = incidents.map((item) => item.id);
    const [customers, events, timeline] = await Promise.all([
      incidentIds.length
        ? this.prisma.incidentCustomer.findMany({
            where: {
              incidentId: { in: incidentIds },
              customerCode: dto.customerCode,
            },
            orderBy: { customerCode: 'asc' },
            take: 10_000,
          })
        : [],
      incidentIds.length
        ? this.prisma.incidentEvent.findMany({
            where: { incidentId: { in: incidentIds } },
            include: {
              alert: {
                select: { externalEventId: true, severity: true },
              },
            },
            orderBy: { occurredAt: 'asc' },
            take: 10_000,
          })
        : [],
      incidentIds.length
        ? this.prisma.incidentTimeline.findMany({
            where: { incidentId: { in: incidentIds } },
            orderBy: { createdAt: 'asc' },
            take: 10_000,
          })
        : [],
    ]);

    const activeStatuses = new Set<IncidentStatus>([
      IncidentStatus.DETECTED,
      IncidentStatus.INVESTIGATING,
      IncidentStatus.CONFIRMED,
      IncidentStatus.IN_PROGRESS,
      IncidentStatus.MONITORING,
    ]);
    const totalConfidence = incidents.reduce(
      (total, item) => total + item.rootCauseConfidence,
      0,
    );
    return {
      title: dto.title ?? this.defaultTitle(dto.type, incident?.code),
      type: dto.type,
      format: dto.format,
      generatedAt: new Date(),
      periodStart,
      periodEnd,
      incident,
      incidents,
      customers,
      events,
      timeline,
      summary: {
        totalIncidents: incidents.length,
        activeIncidents: incidents.filter((item) =>
          activeStatuses.has(item.status),
        ).length,
        affectedCustomers: incidents.reduce(
          (total, item) => total + item.confirmedCustomerCount,
          0,
        ),
        offlineOnus: incidents.reduce(
          (total, item) => total + item.offlineOnuCount,
          0,
        ),
        averageRootCauseConfidence:
          incidents.length === 0
            ? 0
            : Number((totalConfidence / incidents.length).toFixed(2)),
      },
    };
  }

  private incidentWhere(
    dto: GenerateReportDto,
    periodStart: Date | undefined,
    periodEnd: Date | undefined,
  ): Prisma.IncidentWhereInput {
    return {
      oltExternalId: dto.oltExternalId,
      ponIdentifier: dto.ponIdentifier,
      detectedAt:
        periodStart || periodEnd
          ? { gte: periodStart, lte: periodEnd }
          : undefined,
    };
  }

  private defaultTitle(type: ReportType, incidentCode?: string): string {
    return incidentCode
      ? `${type.replaceAll('_', ' ')} — ${incidentCode}`
      : type.replaceAll('_', ' ');
  }
}
