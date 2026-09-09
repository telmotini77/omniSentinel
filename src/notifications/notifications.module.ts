import { Module } from '@nestjs/common';
import {
  NOTIFICATION_DELIVERY_STRATEGIES,
  type NotificationDeliveryStrategy,
} from './notification-message';
import { IncidentNotificationsController } from './incident-notifications.controller';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailNotificationStrategy } from './strategies/email-notification.strategy';
import { WebhookNotificationStrategy } from './strategies/webhook-notification.strategy';

@Module({
  controllers: [NotificationsController, IncidentNotificationsController],
  providers: [
    NotificationsService,
    NotificationRulesService,
    EmailNotificationStrategy,
    WebhookNotificationStrategy,
    {
      provide: NOTIFICATION_DELIVERY_STRATEGIES,
      inject: [EmailNotificationStrategy, WebhookNotificationStrategy],
      useFactory: (
        email: EmailNotificationStrategy,
        webhook: WebhookNotificationStrategy,
      ): NotificationDeliveryStrategy[] => [email, webhook],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
