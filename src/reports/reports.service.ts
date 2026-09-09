import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Report, ReportFormat, ReportStatus, ReportType } from '@prisma/client';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import type { GenerateReportDto } from './dto/generate-report.dto';
import type { ListReportsQueryDto } from './dto/list-reports-query.dto';
import {
  REPORT_STRATEGIES,
  type GeneratedReportFile,
  type ReportGenerationStrategy,
} from './report-document';
import { ReportDataService } from './report-data.service';

export interface ReportDownload {
  report: Report;
  absolutePath: string;
  contentType: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly reportData: ReportDataService,
    @Inject(REPORT_STRATEGIES)
    private readonly strategies: ReportGenerationStrategy[],
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async generate(dto: GenerateReportDto, generatedBy: string): Promise<Report> {
    this.assertRequest(dto);
    const startedAt = process.hrtime.bigint();
    const report = await this.prisma.report.create({
      data: {
        type: dto.type,
        format: dto.format,
        status: ReportStatus.PENDING,
        incidentId: dto.incidentId,
        title: dto.title ?? dto.type.replaceAll('_', ' '),
        periodStart: dto.startDate ? new Date(dto.startDate) : undefined,
        periodEnd: dto.endDate ? new Date(dto.endDate) : undefined,
        generatedBy,
      },
    });
    try {
      await this.prisma.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.GENERATING },
      });
      const document = await this.reportData.build(dto);
      const generated = await this.strategyFor(dto.format).generate(document);
      const output = await this.persistFile(report.id, generated);
      const completed = await this.prisma.report.update({
        where: { id: report.id },
        data: {
          title: document.title,
          status: ReportStatus.COMPLETED,
          fileName: output.fileName,
          filePath: output.absolutePath,
          fileSize: generated.content.length,
          generatedAt: new Date(),
          errorMessage: null,
        },
      });
      this.metrics?.recordReportGenerated(dto.type, dto.format, 'completed');
      this.metrics?.recordReportGenerationDuration(
        this.elapsedSeconds(startedAt),
        dto.format,
        'completed',
      );
      return completed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.FAILED,
          errorMessage: message.slice(0, 2_000),
        },
      });
      this.metrics?.recordReportGenerated(dto.type, dto.format, 'failed');
      this.metrics?.recordReportGenerationDuration(
        this.elapsedSeconds(startedAt),
        dto.format,
        'failed',
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        error: 'REPORT_GENERATION_FAILED',
        message: 'The report could not be generated',
      });
    }
  }

  async list(
    query: ListReportsQueryDto,
  ): Promise<{ data: Report[]; total: number; page: number; limit: number }> {
    const where = {
      type: query.type,
      format: query.format,
      status: query.status,
      incidentId: query.incidentId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async listForIncident(incidentId: string): Promise<Report[]> {
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
    return this.prisma.report.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Report> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException({
        error: 'REPORT_NOT_FOUND',
        message: 'Report not found',
      });
    }
    return report;
  }

  async download(id: string): Promise<ReportDownload> {
    const report = await this.findById(id);
    if (
      report.status !== ReportStatus.COMPLETED ||
      !report.fileName ||
      !report.filePath
    ) {
      throw new ConflictException({
        error: 'REPORT_NOT_READY',
        message: 'The requested report is not available for download',
      });
    }
    const storageRoot = this.storageRoot();
    const absolutePath = resolve(report.filePath);
    if (!absolutePath.startsWith(`${storageRoot}${sep}`)) {
      throw new ConflictException({
        error: 'INVALID_REPORT_PATH',
        message: 'The report file is outside the configured storage path',
      });
    }
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException({
        error: 'REPORT_FILE_NOT_FOUND',
        message: 'The generated report file is missing',
      });
    }
    return {
      report,
      absolutePath,
      contentType: this.contentTypeFor(report.format),
    };
  }

  private async persistFile(
    reportId: string,
    generated: GeneratedReportFile,
  ): Promise<{ fileName: string; absolutePath: string }> {
    const storageRoot = this.storageRoot();
    await mkdir(storageRoot, { recursive: true });
    const fileName = `report-${reportId}.${generated.extension}`;
    const absolutePath = resolve(storageRoot, fileName);
    await writeFile(absolutePath, generated.content);
    return { fileName, absolutePath };
  }

  private strategyFor(format: ReportFormat): ReportGenerationStrategy {
    const strategy = this.strategies.find((item) => item.format === format);
    if (!strategy)
      throw new InternalServerErrorException({
        error: 'REPORT_FORMAT_NOT_CONFIGURED',
        message: `No generation strategy is configured for ${format}`,
      });
    return strategy;
  }

  private assertRequest(dto: GenerateReportDto): void {
    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
      throw new ConflictException({
        error: 'INVALID_REPORT_PERIOD',
        message: 'startDate must be before endDate',
      });
    }
    if (dto.type === ReportType.INCIDENT_REPORT && !dto.incidentId) {
      throw new ConflictException({
        error: 'INCIDENT_ID_REQUIRED',
        message: 'incidentId is required for an incident report',
      });
    }
  }

  private storageRoot(): string {
    return resolve(
      this.configService.getOrThrow<string>('REPORT_STORAGE_PATH'),
    );
  }

  private contentTypeFor(format: ReportFormat): string {
    const types: Record<ReportFormat, string> = {
      [ReportFormat.PDF]: 'application/pdf',
      [ReportFormat.XLSX]:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      [ReportFormat.CSV]: 'text/csv; charset=utf-8',
      [ReportFormat.JSON]: 'application/json; charset=utf-8',
    };
    return types[format];
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
