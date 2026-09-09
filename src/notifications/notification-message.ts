import type {
  Alert,
  Incident,
  NotificationChannel,
  NotificationEvent,
} from '@prisma/client';

export interface NotificationMessage {
  event: NotificationEvent;
  incident: Incident;
  alert?: Alert;
  destination: string;
  payload: Record<string, unknown>;
}

export interface NotificationDeliveryResult {
  metadata?: Record<string, unknown>;
}

export interface NotificationDeliveryStrategy {
  readonly channel: NotificationChannel;
  deliver(message: NotificationMessage): Promise<NotificationDeliveryResult>;
}

export const NOTIFICATION_DELIVERY_STRATEGIES = Symbol(
  'NOTIFICATION_DELIVERY_STRATEGIES',
);
