import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Channel, ConsumeMessage } from 'amqplib';
import { Logger } from 'nestjs-pino';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { IncidentEngineService } from '../incidents/incident-engine.service';
import { ImpactEngineService } from '../impact/impact-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../observability/metrics.service';
import { NotificationEvent } from '@prisma/client';
import { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertConsumerService implements OnModuleInit, OnModuleDestroy {
  private channel?: Channel;
  private consumerTag?: string;

  constructor(
    private readonly rabbitMq: RabbitMqService,
    private readonly alertsService: AlertsService,
    private readonly incidentEngine: IncidentEngineService,
    private readonly impactEngine: ImpactEngineService,
    private readonly notifications: NotificationsService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.getOrThrow<boolean>('RABBITMQ_ENABLED')) {
      this.logger.log('RabbitMQ alert consumer is disabled');
      return;
    }
    this.channel = await this.rabbitMq.createChannel();
    await this.rabbitMq.assertAlertTopology(this.channel);
    await this.channel.prefetch(20);
    const result = await this.channel.consume(
      this.configService.getOrThrow<string>('RABBITMQ_ALERT_QUEUE'),
      (message) => void this.handleMessage(message),
      { noAck: false },
    );
    this.consumerTag = result.consumerTag;
    this.logger.log(
      { queue: this.configService.getOrThrow<string>('RABBITMQ_ALERT_QUEUE') },
      'Alert consumer started',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.channel) return;
    if (this.consumerTag) await this.channel.cancel(this.consumerTag);
    await this.channel.close();
  }

  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) return;
    const startedAt = process.hrtime.bigint();
    try {
      const event = await this.deserialize(message);
      const result = await this.alertsService.ingest(event);
      const processed = await this.incidentEngine.processAlertWithOutcome(
        result.alert,
      );
      const incident = processed.incident;
      if (incident) await this.impactEngine.refreshIncident(incident);
      if (incident) {
        const event = this.notificationEventFor(processed.outcome);
        if (event)
          await this.notifications.dispatch(event, incident, result.alert);
      }
      this.channel.ack(message);
      this.metrics?.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'success',
      );
      this.logger.log(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          alertId: result.alert.id,
          result: result.result,
        },
        'Alert processed',
      );
    } catch (error: unknown) {
      this.metrics?.recordEventProcessingDuration(
        this.elapsedSeconds(startedAt),
        'failed',
      );
      this.metrics?.recordFailedEvent(
        error instanceof InvalidAlertMessageError
          ? 'alert_validation'
          : 'alert_consumer',
      );
      if (error instanceof InvalidAlertMessageError) {
        this.logger.warn(
          { err: error, routingKey: message.fields.routingKey },
          'Invalid alert sent to DLQ',
        );
        this.channel.nack(message, false, false);
        return;
      }
      this.retryOrDeadLetter(message, error);
    }
  }

  private async deserialize(
    message: ConsumeMessage,
  ): Promise<NormalizedNetworkEventDto> {
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(message.content.toString('utf8'));
    } catch {
      throw new InvalidAlertMessageError('Message is not valid JSON');
    }
    const event = plainToInstance(NormalizedNetworkEventDto, rawPayload);
    const errors = await validate(event, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length)
      throw new InvalidAlertMessageError(
        'Message does not match the normalized alert contract',
      );
    return event;
  }

  private retryOrDeadLetter(message: ConsumeMessage, error: unknown): void {
    if (!this.channel) return;
    const headers = message.properties.headers ?? {};
    const currentAttempt = Number(headers['x-retry-count'] ?? 0);
    const maximumRetries = this.configService.getOrThrow<number>(
      'RABBITMQ_MAX_RETRIES',
    );
    if (currentAttempt >= maximumRetries) {
      this.logger.error(
        {
          err: error,
          routingKey: message.fields.routingKey,
          attempts: currentAttempt,
        },
        'Alert retries exhausted; sending to DLQ',
      );
      this.channel.nack(message, false, false);
      return;
    }

    const baseDelay = this.configService.getOrThrow<number>(
      'RABBITMQ_RETRY_DELAY_MS',
    );
    const retryDelay = Math.min(baseDelay * 2 ** currentAttempt, 300_000);
    const retryQueue = this.configService.getOrThrow<string>(
      'RABBITMQ_ALERT_RETRY_QUEUE',
    );
    this.channel.sendToQueue(retryQueue, message.content, {
      persistent: true,
      headers: { ...headers, 'x-retry-count': currentAttempt + 1 },
      expiration: retryDelay.toString(),
    });
    this.channel.ack(message);
    this.logger.warn(
      {
        err: error,
        routingKey: message.fields.routingKey,
        attempt: currentAttempt + 1,
        retryDelay,
      },
      'Alert processing failed; scheduled retry',
    );
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

class InvalidAlertMessageError extends Error {}
