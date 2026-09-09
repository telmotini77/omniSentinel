import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Alert } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AlertIngestResponseDto } from './dto/alert-ingest-response.dto';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';
import { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { AlertsService } from './alerts.service';
import type { Response } from 'express';
import { IncidentEngineService } from '../incidents/incident-engine.service';
import { ImpactEngineService } from '../impact/impact-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../observability/metrics.service';
import { NotificationEvent } from '@prisma/client';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly incidentEngine: IncidentEngineService,
    private readonly impactEngine: ImpactEngineService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
  ) {}

  @Post('ingest')
  @Public()
  @UseGuards(IntegrationApiKeyGuard)
  @ApiOperation({
    summary: 'Receives a normalized alert from api_zaSmaOlt over HTTP',
  })
  @ApiHeader({ name: 'x-integration-api-key', required: true })
  @ApiResponse({ status: HttpStatus.CREATED, type: AlertIngestResponseDto })
  @ApiResponse({
    status: HttpStatus.OK,
    type: AlertIngestResponseDto,
    description: 'Duplicate event',
  })
  async ingest(
    @Body() event: NormalizedNetworkEventDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AlertIngestResponseDto> {
    const startedAt = process.hrtime.bigint();
    try {
      const result = await this.alertsService.ingest(event);
      const processed = await this.incidentEngine.processAlertWithOutcome(
        result.alert,
      );
      const incident = processed.incident;
      if (incident) await this.impactEngine.refreshIncident(incident);
      if (incident) {
        const notificationEvent = this.notificationEventFor(processed.outcome);
        if (notificationEvent)
          await this.notifications.dispatch(
            notificationEvent,
            incident,
            result.alert,
          );
      }
      response.status(
        result.result === 'created' ? HttpStatus.CREATED : HttpStatus.OK,
      );
      this.metrics.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'success',
      );
      return {
        result: result.result,
        alertId: result.alert.id,
        externalEventId: result.alert.externalEventId,
      };
    } catch (error: unknown) {
      this.metrics.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'failed',
      );
      this.metrics.recordFailedEvent('http_alert_ingest');
      throw error;
    }
  }

  private notificationEventFor(
    outcome:
      | 'CREATED'
      | 'CORRELATED'
      | 'RECOVERY_DETECTED'
      | 'ALREADY_PROCESSED'
      | 'IGNORED',
  ): NotificationEvent | undefined {
    const events = {
      CREATED: NotificationEvent.INCIDENT_CREATED,
      CORRELATED: NotificationEvent.INCIDENT_CORRELATED,
      RECOVERY_DETECTED: NotificationEvent.INCIDENT_RECOVERY_DETECTED,
    } as const;
    return events[outcome as keyof typeof events];
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }

  @Get()
  @ApiBearerAuth('access-token')
  @Permissions('incident.read')
  @ApiOperation({
    summary: 'Lists stored alerts with pagination and operational filters',
  })
  list(
    @Query() query: ListAlertsQueryDto,
  ): Promise<{ data: Alert[]; total: number; page: number; limit: number }> {
    return this.alertsService.list(query);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Permissions('incident.read')
  @ApiOkResponse({ description: 'Alert found' })
  getById(@Param('id') id: string): Promise<Alert> {
    return this.alertsService.findById(id);
  }
}
