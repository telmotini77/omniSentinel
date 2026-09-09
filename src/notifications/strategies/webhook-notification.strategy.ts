import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import type {
  NotificationDeliveryResult,
  NotificationDeliveryStrategy,
  NotificationMessage,
} from '../notification-message';

@Injectable()
export class WebhookNotificationStrategy implements NotificationDeliveryStrategy {
  readonly channel = NotificationChannel.WEBHOOK;

  constructor(private readonly configService: ConfigService) {}

  async deliver(
    message: NotificationMessage,
  ): Promise<NotificationDeliveryResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.configService.getOrThrow<number>('NOTIFICATION_WEBHOOK_TIMEOUT_MS'),
    );
    try {
      const response = await fetch(message.destination, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message.payload),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Webhook responded with HTTP ${response.status}`);
      return { metadata: { statusCode: response.status } };
    } finally {
      clearTimeout(timer);
    }
  }
}
