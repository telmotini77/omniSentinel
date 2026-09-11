import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEvent } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import { ImpactEngineService } from '../impact/impact-engine.service';
import {
  ZASMAOLT_ADAPTER,
  type ExternalOperationalEvent,
  type ZasmaoltAdapter,
} from '../integrations/zasmaolt/zasmaolt.adapter';
import { IncidentEngineService } from '../incidents/incident-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../observability/metrics.service';
import { AlertsService } from './alerts.service';
import { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';

const CURSOR_KEY = 'zasmaolt:operational-events:cursor';

/**
 * Pulls source-confirmed operational events from api_zaSmaOlt.
 *
 * The source can be reached over a private Docker network or HTTPS. Its
 * PostgreSQL cursor and `eventId` uniqueness make restarts and retrying safe
 * with PostgreSQL only.
 */
@Injectable()
export class ZasmaoltEventPullerService
  implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cursor = 0;
  private polling = false;

  constructor(
    @Inject(ZASMAOLT_ADAPTER)
    private readonly zasmaolt: ZasmaoltAdapter,
    private readonly alertsService: AlertsService,
    private readonly incidentEngine: IncidentEngineService,
    private readonly impactEngine: ImpactEngineService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    @Optional() private readonly metrics?: MetricsService,
  ) { }

  async onModuleInit(): Promise<void> {
    if (
      !this.configService.getOrThrow<boolean>('ZASMAOLT_EVENT_PULL_ENABLED')
    ) {
      this.logger.log('api_zaSmaOlt operational event puller is disabled');
      return;
    }
    await this.restoreCursor();
    void this.poll();
    this.timer = setInterval(
      () => void this.poll(),
      this.configService.getOrThrow<number>('ZASMAOLT_EVENT_PULL_INTERVAL_MS'),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async restoreCursor(): Promise<void> {
    try {
      const stored = await this.prisma.systemSetting.findUnique({
        where: { key: CURSOR_KEY },
      });
      const parsed = Number.parseInt(String(stored?.value ?? ''), 10);
      if (Number.isInteger(parsed) && parsed >= 0) this.cursor = parsed;
    } catch (error: unknown) {
      this.logger.warn(
        { err: error },
        'Could not restore api_zaSmaOlt event cursor; eventId deduplication will protect replayed events',
      );
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      // Limit each run so a large historical backlog never monopolizes the
      // event loop or delays normal HTTP processing.
      for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
        const page = await this.zasmaolt.listOperationalEvents(
          this.cursor,
          this.configService.getOrThrow<number>(
            'ZASMAOLT_EVENT_PULL_BATCH_SIZE',
          ),
        );
        if (!page.data.length) return;
        for (const item of page.data) await this.processItem(item);
        if (!page.hasMore) return;
      }
    } catch (error: unknown) {
      this.metrics?.recordFailedEvent('zasmaolt_event_pull');
      this.logger.warn(
        { err: error },
        'api_zaSmaOlt operational event pull failed; it will retry automatically',
      );
    } finally {
      this.polling = false;
    }
  }

  private async processItem(item: ExternalOperationalEvent): Promise<void> {
    const startedAt = process.hrtime.bigint();
    let event: NormalizedNetworkEventDto;
    try {
      event = await this.validateEvent(item.event);
    } catch (error: unknown) {
      this.metrics?.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'invalid',
      );
      this.metrics?.recordFailedEvent('zasmaolt_event_validation');
      this.logger.error(
        { err: error, cursor: item.cursor },
        'Ignoring invalid event from api_zaSmaOlt event feed',
      );
      await this.advanceCursor(item.cursor);
      return;
    }

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
      await this.advanceCursor(item.cursor);
      this.metrics?.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'success',
      );
      this.logger.log(
        {
          cursor: item.cursor,
          eventId: event.eventId,
          eventType: event.eventType,
          alertId: result.alert.id,
          result: result.result,
        },
        'api_zaSmaOlt event processed',
      );
    } catch (error: unknown) {
      this.metrics?.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'failed',
      );
      this.metrics?.recordFailedEvent('zasmaolt_event_processing');
      throw error;
    }
  }

  private async validateEvent(
    rawEvent: NormalizedNetworkEventDto,
  ): Promise<NormalizedNetworkEventDto> {
    const event = plainToInstance(NormalizedNetworkEventDto, rawEvent);
    const errors = await validate(event, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length)
      throw new InvalidUpstreamEventError(
        'Event does not match the normalized alert contract',
      );
    return event;
  }

  private async advanceCursor(cursor: number): Promise<void> {
    if (!Number.isInteger(cursor) || cursor < this.cursor) {
      throw new Error('api_zaSmaOlt returned a non-monotonic event cursor');
    }
    this.cursor = cursor;
    await this.prisma.systemSetting.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value: cursor },
      update: { value: cursor },
    });
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
}

class InvalidUpstreamEventError extends Error { }

